import { InjectedScript } from 'playwright-injected'

;(function (w) {
  if (!w || w.__o2EnsureAria) return
  w.__o2EnsureAria = function () {
    if (w.__o2Aria) return w.__o2Aria
    w.__o2Aria = new InjectedScript(w, {
      isUnderTest: false,
      sdkLanguage: 'javascript',
      testIdAttributeName: 'data-testid',
      stableRafCount: 0,
      browserName: 'chromium',
      customEngines: [],
    })
    return w.__o2Aria
  }
})(typeof window !== 'undefined' ? window : globalThis)
