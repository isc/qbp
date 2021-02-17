import { PitchDetector } from 'pitchy'
import abcjs from 'abcjs'
import Chartist from 'chartist'
import 'chartist/dist/chartist.css'
import autoCorrelate from './autocorrelate'

let currentScore = 'X:1\nL:1/4\n'
let audioContext = null
let isPlaying = false
let analyser = null
let mediaStreamSource = null
let detectorElem
let pitchElem
let noteElem
let togglePlaybackButton
const inputLength = 2048
const detector = PitchDetector.forFloat32Array(inputLength)
const input = new Float32Array(detector.inputLength)
let rafID = null
const noteStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const abcNoteStrings = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B']
const pitchDetectionAlgorithm = 'mcleod'
let pitchValues = null
let rmsValues = null
let currentNote
let sourceNode

function lineChart(values, canvasId) {
  Chartist.Line(
    canvasId,
    { series: [values] },
    { lineSmooth: false, showPoint: false, height: 200, showArea: true, axisX: { showGrid: false } }
  )
}

function drawLineCharts() {
  lineChart(pitchValues, '#pitch-line')
  lineChart(rmsValues, '#rms-line')
}

function initialize() {
  isPlaying = true
  currentScore = 'X:1\nL:1/4\n'
  abcjs.renderAbc('paper', currentScore)
  pitchValues = []
  rmsValues = []
  currentNote = []
  document.querySelector('#pitch-line').innerHTML = ''
  document.querySelector('#rms-line').innerHTML = ''
}

function noteFromPitch(frequency) {
  const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2))
  return Math.round(noteNum) + 69
}

function appendCurrentNote() {
  if (currentNote.length <= 3) {
    for (let i = 0; i < currentNote.length; i += 1) pitchValues.push(null)
    return
  }
  let sum = 0
  for (let i = 0; i < currentNote.length; i += 1) {
    sum += currentNote[i]
    pitchValues.push(noteFromPitch(currentNote[i]))
  }
  const avg = sum / currentNote.length
  currentScore += abcNoteStrings[noteFromPitch(avg) % 12]
  abcjs.renderAbc('paper', currentScore)
}

function updatePitch() {
  let ac
  if (pitchDetectionAlgorithm === 'mcleod') {
    analyser.getFloatTimeDomainData(input)
    const [pitch, clarity] = detector.findPitch(input, audioContext.sampleRate)
    ac = clarity > 0.95 ? pitch : -1
  } else {
    analyser.getFloatTimeDomainData(input)
    ac = autoCorrelate(input, audioContext.sampleRate)
  }
  let rms = 0
  for (let i = 0; i < inputLength; i += 1) rms += input[i] * input[i]
  rms = Math.sqrt(rms / inputLength)
  rmsValues.push(rms)

  if (ac === -1 || !ac) {
    appendCurrentNote()
    currentNote = []
    detectorElem.className = 'vague'
    pitchElem.innerText = '--'
    noteElem.innerText = '-'
    pitchValues.push(null)
  } else {
    currentNote.push(ac)
    detectorElem.className = 'confident'
    pitchElem.innerText = Math.round(ac)
    const note = noteFromPitch(ac)
    noteElem.innerHTML = noteStrings[note % 12]
  }
  rafID = window.requestAnimationFrame(updatePitch)
}

function gotStream(stream) {
  mediaStreamSource = audioContext.createMediaStreamSource(stream)
  analyser = audioContext.createAnalyser()
  analyser.fftSize = 2048
  mediaStreamSource.connect(analyser)
  updatePitch()
}

function stopPlayback() {
  appendCurrentNote()
  sourceNode.stop()
  drawLineCharts()
  window.cancelAnimationFrame(rafID)
  togglePlaybackButton.innerHTML = 'Start'
  isPlaying = false
}

function togglePlayback() {
  if (isPlaying) {
    stopPlayback()
    return
  }
  togglePlaybackButton.innerHTML = 'Stop'
  initialize()
  audioContext = new AudioContext()
  const request = new XMLHttpRequest()
  request.open('GET', document.querySelector('select').value, true)
  request.responseType = 'arraybuffer'
  request.onload = () => {
    audioContext.decodeAudioData(request.response, (buffer) => {
      sourceNode = audioContext.createBufferSource()
      sourceNode.buffer = buffer
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      sourceNode.connect(analyser)
      analyser.connect(audioContext.destination)
      sourceNode.start(0)
      sourceNode.onended = stopPlayback
      updatePitch()
    })
  }
  request.send()
}

function toggleLiveInput() {
  if (isPlaying) {
    window.cancelAnimationFrame(rafID)
    analyser = null
    isPlaying = false
    drawLineCharts()
    return
  }
  initialize()
  audioContext = new AudioContext()
  try {
    navigator.mediaDevices
      .getUserMedia({ audio: { channelCount: 1 } })
      .then(gotStream)
      .catch(() => alert('Stream generation failed.'))
  } catch (e) {
    alert(`getUserMedia threw exception :${e}`)
  }
}

window.onload = () => {
  document.querySelector('#mic').onclick = toggleLiveInput
  togglePlaybackButton = document.querySelector('#sample')
  togglePlaybackButton.onclick = togglePlayback
  detectorElem = document.getElementById('detector')
  pitchElem = document.getElementById('pitch')
  noteElem = document.getElementById('note')
  abcjs.renderAbc('paper', currentScore)
}
