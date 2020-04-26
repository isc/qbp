import abcjs from 'abcjs'

var currentScore = 'X:1\nL:1/4\n'
var audioContext = null
var isPlaying = false
var analyser = null
var mediaStreamSource = null
var detectorElem, pitchElem, noteElem, detuneElem, detuneAmount

window.onload = function () {
  document.querySelector('button').onclick = toggleLiveInput
  detectorElem = document.getElementById('detector')
  pitchElem = document.getElementById('pitch')
  noteElem = document.getElementById('note')
  detuneElem = document.getElementById('detune')
  detuneAmount = document.getElementById('detune_amt')
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

function toggleLiveInput() {
  if (isPlaying) {
    analyser = null
    isPlaying = false
    window.cancelAnimationFrame(rafID)
    return
  }
  isPlaying = true
  currentScore = 'X:1\nL:1/4\n'
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

var rafID = null
var buflen = 1024
var buf = new Float32Array(buflen)

var noteStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
var abcNoteStrings = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B']

function noteFromPitch(frequency) {
  var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2))
  return Math.round(noteNum) + 69
}

function frequencyFromNoteNumber(note) {
  return 440 * Math.pow(2, (note - 69) / 12)
}

function centsOffFromPitch(frequency, note) {
  return Math.floor((1200 * Math.log(frequency / frequencyFromNoteNumber(note))) / Math.log(2))
}

var MIN_SAMPLES = 0 // will be initialized when AudioContext is created.
var GOOD_ENOUGH_CORRELATION = 0.9 // this is the "bar" for how close a correlation needs to be

// https://raw.githubusercontent.com/cwilso/PitchDetect/master/js/pitchdetect.js
function autoCorrelate(buf, sampleRate) {
  var SIZE = buf.length
  var MAX_SAMPLES = Math.floor(SIZE / 2)
  var best_offset = -1
  var best_correlation = 0
  var rms = 0
  var foundGoodCorrelation = false
  var correlations = new Array(MAX_SAMPLES)

  for (var i = 0; i < SIZE; i++) {
    var val = buf[i]
    rms += val * val
  }
  rms = Math.sqrt(rms / SIZE)
  if (rms < 0.01)
    // not enough signal
    return -1

  var lastCorrelation = 1
  for (var offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
    var correlation = 0

    for (var i = 0; i < MAX_SAMPLES; i++) {
      correlation += Math.abs(buf[i] - buf[i + offset])
    }
    correlation = 1 - correlation / MAX_SAMPLES
    correlations[offset] = correlation // store it, for the tweaking we need to do below.
    if (correlation > GOOD_ENOUGH_CORRELATION && correlation > lastCorrelation) {
      foundGoodCorrelation = true
      if (correlation > best_correlation) {
        best_correlation = correlation
        best_offset = offset
      }
    } else if (foundGoodCorrelation) {
      // short-circuit - we found a good correlation, then a bad one, so we'd just be seeing copies from here.
      // Now we need to tweak the offset - by interpolating between the values to the left and right of the
      // best offset, and shifting it a bit.  This is complex, and HACKY in this code (happy to take PRs!) -
      // we need to do a curve fit on correlations[] around best_offset in order to better determine precise
      // (anti-aliased) offset.

      // we know best_offset >=1,
      // since foundGoodCorrelation cannot go to true until the second pass (offset=1), and
      // we can't drop into this clause until the following pass (else if).
      var shift = (correlations[best_offset + 1] - correlations[best_offset - 1]) / correlations[best_offset]
      return sampleRate / (best_offset + 8 * shift)
    }
    lastCorrelation = correlation
  }
  if (best_correlation > 0.01) {
    // console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")")
    return sampleRate / best_offset
  }
  return -1
  //	var best_frequency = sampleRate/best_offset;
}

let previousValue = null
function updatePitch(time) {
  var cycles = new Array()
  analyser.getFloatTimeDomainData(buf)
  var ac = autoCorrelate(buf, audioContext.sampleRate)

  if (ac == -1) {
    detectorElem.className = 'vague'
    pitchElem.innerText = '--'
    noteElem.innerText = '-'
    detuneElem.className = ''
    detuneAmount.innerText = '--'
  } else {
    detectorElem.className = 'confident'
    const pitch = ac
    pitchElem.innerText = Math.round(pitch)
    var note = noteFromPitch(pitch)
    noteElem.innerHTML = noteStrings[note % 12]
    console.log(noteElem.innerHTML)
    if (previousValue === -1) {
      currentScore += abcNoteStrings[note % 12]
      abcjs.renderAbc('paper', currentScore)
    }
    var detune = centsOffFromPitch(pitch, note)
    if (detune == 0) {
      detuneElem.className = ''
      detuneAmount.innerHTML = '--'
    } else {
      if (detune < 0) detuneElem.className = 'flat'
      else detuneElem.className = 'sharp'
      detuneAmount.innerHTML = Math.abs(detune)
    }
  }
  previousValue = ac
  rafID = window.requestAnimationFrame(updatePitch)
}
