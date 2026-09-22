// Register only the controls used by this workbench. Cesium retains its own UI.
import '@awesome.me/webawesome/dist/styles/themes/default.css'
import '@awesome.me/webawesome/dist/translations/zh-cn.js'
import '@awesome.me/webawesome/dist/components/button/button.js'
import '@awesome.me/webawesome/dist/components/details/details.js'
import '@awesome.me/webawesome/dist/components/dialog/dialog.js'
import '@awesome.me/webawesome/dist/components/input/input.js'
import '@awesome.me/webawesome/dist/components/option/option.js'
import '@awesome.me/webawesome/dist/components/select/select.js'
import '@awesome.me/webawesome/dist/components/slider/slider.js'
import '@awesome.me/webawesome/dist/components/textarea/textarea.js'

import type WaSelect from '@awesome.me/webawesome/dist/components/select/select.js'

document.querySelectorAll<WaSelect>('wa-select').forEach(select => {
  void select.updateComplete.then(() => { select.popup.distance = 6 })
})

export type { default as UiButton } from '@awesome.me/webawesome/dist/components/button/button.js'
export type { default as UiDetails } from '@awesome.me/webawesome/dist/components/details/details.js'
export type { default as UiDialog } from '@awesome.me/webawesome/dist/components/dialog/dialog.js'
export type { default as UiInput } from '@awesome.me/webawesome/dist/components/input/input.js'
export type { default as UiOption } from '@awesome.me/webawesome/dist/components/option/option.js'
export type { default as UiSelect } from '@awesome.me/webawesome/dist/components/select/select.js'
export type { default as UiSlider } from '@awesome.me/webawesome/dist/components/slider/slider.js'
export type { default as UiTextarea } from '@awesome.me/webawesome/dist/components/textarea/textarea.js'
