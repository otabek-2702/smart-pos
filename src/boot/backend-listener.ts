import { boot } from 'quasar/wrappers'
import { Notify } from 'quasar'

export default boot(() => {
  if (!window.backend) return

  window.backend.onError((msg) => {
    console.error('Backend error:', msg)

    Notify.create({
      type: 'negative',
      message: msg,
      timeout: 5000
    })
  })

  window.backend.onLog((msg) => {
    console.log('Backend log:', msg)
  })
})