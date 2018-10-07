'use strict'

const {ipcRenderer} = require('electron')
const ScrollTracker = require('./lib/ScrollTracker')
const { EVENTS, NAVTYPE } = require('./lib/constants')

function Scroller() {
  this.trackers = new Map()
  this.motion = NAVTYPE.NEW_PAGE
}

// Connect scroller to a webview
// TODO: Allow array of selectors or array of elements
Scroller.prototype.add = function (selector) {
  let self = this
  selector = selector || 'webview'
  let webview = isElement(selector) ? selector : document.querySelector(selector)
  if (webview === null || !isElement(webview)) {
    let msg = `Unable to find <webview> with selector = "${selector}".`
    throw new ReferenceError(msg)
  }
  if (this.trackers.get(webview) !== undefined) {
    let msg = `A webview with the selector "${selector}"`
    msg += ` is already being tracked`
    throw new DuplicateError(msg)
  }
  let tracker = new ScrollTracker(webview)

  // Set up webview event listeners
  webview.addEventListener('ipc-message', function(e) {
    if (e.channel === EVENTS.DID_SCROLL) {
      self.didScroll.call(self, webview, e.args[0].position)
    }
  })
  webview.addEventListener('did-navigate', function() {
    self.didNavigate.call(self, webview)
  })
  //webview.addEventListener('did-navigate-in-page', function() {
  //  Currently unused
  //})
  webview.addEventListener('did-finish-load', function () {
    if (self.motion !== NAVTYPE.NEW_PAGE) {
      let position = tracker.getScrollPosition()
      webview.send(EVENTS.SCROLL_TO, position)
      self.motion = NAVTYPE.NEW_PAGE
    }
  })

  // Hook into the webview navigation functions
  tracker.webviewGoBack = webview.goBack
  webview.goBack = function () {
    tracker.back()
    tracker.webviewGoBack.call(webview)
    self.motion = NAVTYPE.BACK
  }
  tracker.webviewGoForward = webview.goForward
  webview.goForward = function () {
    tracker.forward()
    tracker.webviewGoForward.call(webview)
    self.motion = NAVTYPE.FORWARD
  }
  tracker.webviewReload = webview.reload
  webview.reload = function () {
    tracker.reload()
    tracker.webviewReload.call(webview)
    self.motion = NAVTYPE.RELOAD
  }
  this.trackers.set(webview, tracker)

  try {
    if (webview.getURL()) {
      this.didNavigate(webview)
    }
  } catch (e) {
      // Nothing to do here. The webview isn't part of the DOM yet and will
      // automatically call didNavigate once it finishes
  }
}

//
// Event Handlers
//
Scroller.prototype.didScroll = function (webview, position) {
  this.trackers.get(webview).didScroll(position)
}

Scroller.prototype.didNavigate = function (webview) {
  this.trackers.get(webview).didNavigate(webview.getURL())
}

//
// Preload Method
//
Scroller.prototype.preload = function () {
  document.addEventListener("DOMContentLoaded", function() {
    window.addEventListener('scroll', function(event) {
      ipcRenderer.sendToHost(EVENTS.DID_SCROLL, {
        position: {
          x: window.scrollX,
          y: window.scrollY
        }
      })
    })
  })
  ipcRenderer.on(EVENTS.SCROLL_TO, function (event, position) {
    window.scrollTo(position.x, position.y)
    ipcRenderer.sendToHost(EVENTS.DID_SCROLL_TO, { position: position })
  })
}

//
//  Error Declarations
//
function DuplicateError(message) {
  this.name = 'DuplicateError'
  this.message = message
  this.stack = (new Error()).stack
}
DuplicateError.prototype = new Error

//
// Utility Functions
//
function isElement(obj) {
  try {
    return obj instanceof HTMLElement
  } catch (e) {
    return (typeof obj === 'object') &&
    (obj.nodeType === 1) && (typeof obj.style === "object") &&
    (typeof obj.ownerDocument === "object")
  }
}

module.exports = new Scroller()
