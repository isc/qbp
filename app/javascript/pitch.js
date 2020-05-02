import { PitchDetector } from 'pitchy'
import abcjs from 'abcjs'
import autoCorrelate from './autocorrelate'
import Chartist from 'chartist'
import 'chartist/dist/scss/chartist'

var currentScore = 'X:1\nL:1/4\n'
var audioContext = null
var isPlaying = false
var analyser = null
var mediaStreamSource = null
var detectorElem, pitchElem, noteElem
let togglePlaybackButton
const inputLength = 2048
const detector = PitchDetector.forFloat32Array(inputLength)
const input = new Float32Array(detector.inputLength)
var rafID = null
var noteStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
var abcNoteStrings = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B']
const pitchDetectionAlgorithm = 'mcleod'
let previousValue = null
let pitchValues = null
let rmsValues = null
let currentNote
let sourceNode

window.onload = function () {
  document.querySelector('#mic').onclick = toggleLiveInput
  togglePlaybackButton = document.querySelector('#sample')
  togglePlaybackButton.onclick = togglePlayback
  detectorElem = document.getElementById('detector')
  pitchElem = document.getElementById('pitch')
  noteElem = document.getElementById('note')
  abcjs.renderAbc('paper', currentScore)
}

function getUserMedia(dictionary, callback) {
  audioContext = new AudioContext()
  try {
    navigator.getUserMedia(dictionary, callback, () => alert('Stream generation failed.'))
  } catch (e) {
    alert('getUserMedia threw exception :' + e)
  }
}

function gotStream(stream) {
  mediaStreamSource = audioContext.createMediaStreamSource(stream)
  analyser = audioContext.createAnalyser()
  analyser.fftSize = 2048
  mediaStreamSource.connect(analyser)
  updatePitch()
}

function lineChart(values, canvasId) {
  new Chartist.Line(
    canvasId,
    { series: [values] },
    { lineSmooth: false, showPoint: false, height: 200, showArea: true }
  )
}

function drawLineCharts() {
  lineChart(pitchValues, '#pitch-line')
  lineChart(rmsValues, '#rms-line')
}

function initialize() {
  currentScore = 'X:1\nL:1/4\n'
  pitchValues = []
  rmsValues = []
  currentNote = []
}

function togglePlayback() {
  if (isPlaying) {
    sourceNode.stop()
    togglePlaybackButton.innerHTML = 'Start'
    isPlaying = false
    return
  }
  isPlaying = true
  togglePlaybackButton.innerHTML = 'Stop'
  initialize()
  audioContext = new AudioContext()
  var request = new XMLHttpRequest()
  request.open('GET', document.querySelector('select').value, true)
  request.responseType = 'arraybuffer'
  request.onload = function () {
    audioContext.decodeAudioData(request.response, function (buffer) {
      sourceNode = audioContext.createBufferSource()
      sourceNode.buffer = buffer
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      sourceNode.connect(analyser)
      analyser.connect(audioContext.destination)
      sourceNode.start(0)
      sourceNode.onended = () => {
        drawLineCharts()
        togglePlaybackButton.innerHTML = 'Start'
        isPlaying = false
      }
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
  isPlaying = true
  initialize()
  getUserMedia(
    {
      audio: {
        mandatory: {
          googEchoCancellation: 'false',
          googAutoGainControl: 'false',
          googNoiseSuppression: 'false',
          googHighpassFilter: 'false',
        },
        optional: [],
      },
    },
    gotStream
  )
}

function noteFromPitch(frequency) {
  var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2))
  return Math.round(noteNum) + 69
}

function updatePitch(time) {
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
  for (var i = 0; i < inputLength; i++) {
    var val = input[i]
    rms += val * val
  }
  rms = Math.sqrt(rms / inputLength)
  rmsValues.push(rms)

  if (ac == -1 || !ac) {
    if (currentNote.length) {
      let sum = 0
      for (var i = 0; i < currentNote.length; i++) {
        sum += currentNote[i]
      }
      const avg = sum / currentNote.length
      var note = noteFromPitch(avg)
      currentScore += abcNoteStrings[note % 12]
      abcjs.renderAbc('paper', currentScore)
      currentNote = []
    }
    previousValue = -1
    detectorElem.className = 'vague'
    pitchElem.innerText = '--'
    noteElem.innerText = '-'
    pitchValues.push(0)
  } else {
    currentNote.push(ac)
    detectorElem.className = 'confident'
    pitchElem.innerText = Math.round(ac)
    var note = noteFromPitch(ac)
    pitchValues.push(note)
    noteElem.innerHTML = noteStrings[note % 12]
    previousValue = note
  }

  rafID = window.requestAnimationFrame(updatePitch)
}
