// background.js – Service Worker
// Handles: cert storage, soul caching, content-script messaging

const API_BASE = 'https://YOUR_DOMAIN'

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CACHE_SOUL') {
    chrome.storage.local.set({ soul_cache: msg.soul })
    return false
  }

  if (msg.type === 'GET_SOUL_IDENTITY') {
    chrome.storage.local.get(['soul_cert', 'soul_cache'], (data) => {
      const soul = data.soul_cache || ''
      const nameMatch = soul.match(/soul_name:\s*(.+)/)
      const emailMatch = soul.match(/email:\s*(.+)/)
      sendResponse({
        identity: {
          name: nameMatch?.[1]?.trim() || '',
          email: emailMatch?.[1]?.trim() || ''
        }
      })
    })
    return true
  }
})

chrome.runtime.onInstalled.addListener(() => {
  console.log('[SYS] SaveYourSoul Extension bereit')
})
