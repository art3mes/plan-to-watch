import type { StateCreator } from 'zustand'
import { MalListError, fetchMalIndex, fetchMalList } from '../utils/mal-list'
import type { ListSummary } from '../vf/utils/list-overlay'
import { buildStatusBytes } from '../vf/utils/list-overlay'
import type { VoroforceSlice } from './voroforce-slice'

export type ListState = 'idle' | 'loading' | 'ready' | 'error'

export interface ListSlice {
  listOpen: boolean
  setListOpen: (open: boolean) => void
  toggleListOpen: () => void
  listState: ListState
  listUsername?: string
  listError?: string
  listSummary?: ListSummary
  listTotal?: number
  /** One status byte per wall position; the overlay uploads it to the GPU. */
  listBytes?: Uint8Array
  listDimOthers: boolean
  setListDimOthers: (dim: boolean) => void
  loadList: (username: string) => Promise<void>
  clearList: () => void
}

export const createListSlice: StateCreator<
  ListSlice & VoroforceSlice,
  [],
  [],
  ListSlice
> = (set, get) => ({
  listOpen: false,
  setListOpen: (listOpen: boolean) => set({ listOpen }),
  toggleListOpen: () => set({ listOpen: !get().listOpen }),
  listState: 'idle',
  listDimOthers: false,
  setListDimOthers: (listDimOthers: boolean) => {
    const { userConfig, setUserConfig } = get()
    userConfig.listDimOthers = listDimOthers
    setUserConfig(userConfig)
    set({ listDimOthers })
  },
  loadList: async (username: string) => {
    const name = username.trim()
    if (!name) return
    set({ listState: 'loading', listError: undefined })

    try {
      const [list, malIds] = await Promise.all([
        fetchMalList(name),
        fetchMalIndex(),
      ])
      const cellCount = get().voroforce?.cells.length ?? malIds.length
      const { bytes, summary } = buildStatusBytes(
        list.statuses,
        malIds,
        cellCount,
      )

      const { userConfig, setUserConfig } = get()
      userConfig.malUsername = list.user
      setUserConfig(userConfig)

      set({
        listState: 'ready',
        listUsername: list.user,
        listTotal: list.total,
        listSummary: summary,
        listBytes: bytes,
      })
    } catch (error) {
      set({
        listState: 'error',
        listError:
          error instanceof MalListError
            ? error.message
            : 'Could not load that list.',
        listBytes: undefined,
        listSummary: undefined,
        listUsername: undefined,
      })
    }
  },
  clearList: () => {
    const { userConfig, setUserConfig } = get()
    userConfig.malUsername = undefined
    setUserConfig(userConfig)
    set({
      listState: 'idle',
      listUsername: undefined,
      listError: undefined,
      listSummary: undefined,
      listTotal: undefined,
      listBytes: undefined,
    })
  },
})
