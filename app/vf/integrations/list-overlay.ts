import { store } from '../../store'
import { type ListOverlay, createListOverlay } from '../utils/list-overlay'

const TINT_STRENGTH = 1
const DIM_STRENGTH = 0.85

let overlay: ListOverlay | undefined

const apply = () => {
  if (!overlay) return
  const { listBytes, listDimOthers } = store.getState()
  overlay.setStatusBytes(listBytes)
  overlay.setStrength(
    listBytes ? TINT_STRENGTH : 0,
    listBytes && listDimOthers ? DIM_STRENGTH : 0,
  )
}

export const handleListOverlay = () => {
  const { voroforce, userConfig, loadList, setListDimOthers } = store.getState()
  if (!voroforce) return

  overlay = createListOverlay(voroforce)
  if (!overlay) return

  if (userConfig.listDimOthers) setListDimOthers(true)
  apply()

  store.subscribe((state) => state.listBytes, apply)
  store.subscribe((state) => state.listDimOthers, apply)

  // A remembered profile comes back marked without asking again.
  if (userConfig.malUsername) void loadList(userConfig.malUsername)
}
