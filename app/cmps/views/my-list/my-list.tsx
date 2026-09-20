import { useShallowState } from '@/store'
import { type FormEvent, useEffect, useState } from 'react'
import { LIST_STATUS_META } from '../../../vf/utils/list-overlay'
import { Modal } from '../../common/modal'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { ScrollArea } from '../../ui/scroll-area'
import { Switch } from '../../ui/switch'

export const MyList = () => {
  const {
    open,
    setOpen,
    listState,
    listUsername,
    listError,
    listSummary,
    listTotal,
    listDimOthers,
    setListDimOthers,
    loadList,
    clearList,
  } = useShallowState((state) => ({
    open: state.listOpen,
    setOpen: state.setListOpen,
    listState: state.listState,
    listUsername: state.listUsername,
    listError: state.listError,
    listSummary: state.listSummary,
    listTotal: state.listTotal,
    listDimOthers: state.listDimOthers,
    setListDimOthers: state.setListDimOthers,
    loadList: state.loadList,
    clearList: state.clearList,
  }))

  const [username, setUsername] = useState(listUsername ?? '')
  useEffect(() => {
    if (listUsername) setUsername(listUsername)
  }, [listUsername])

  const loading = listState === 'loading'
  const loaded = listState === 'ready' && !!listSummary

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void loadList(username)
  }

  return (
    <Modal
      rootProps={{
        open: open,
        onClose: () => setOpen(false),
      }}
      overlay
      footer={
        <div className='flex w-full flex-row justify-between gap-3 p-4 md:gap-6 md:p-6'>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Close
          </Button>
          {loaded && (
            <Button
              variant='outline'
              onClick={() => {
                clearList()
                setUsername('')
              }}
            >
              Clear
            </Button>
          )}
        </div>
      }
    >
      <ScrollArea
        className='not-landscape:w-full bg-background/60 lg:w-full landscape:h-full'
        innerClassName='max-h-[calc(100vh-var(--spacing)*12)]'
      >
        <div className='flex min-h-64 w-full flex-col gap-6 p-4 pb-18 md:p-6 md:pb-24 lg:pt-16 lg:pb-24'>
          <div className='flex flex-col gap-2'>
            <h6 className='font-black text-2xl leading-none'>My list</h6>
            <p className='text-foreground/70 text-sm'>
              Mark a public MyAnimeList profile on the wall. Nothing is stored
              on the server; the name stays in this browser.
            </p>
          </div>

          <form className='flex flex-col gap-2' onSubmit={submit}>
            <Label htmlFor='mal-username'>MyAnimeList username</Label>
            <div className='flex flex-row gap-2'>
              <Input
                id='mal-username'
                value={username}
                autoComplete='off'
                autoCapitalize='off'
                spellCheck={false}
                placeholder='e.g. art3mes'
                onChange={(event) => setUsername(event.target.value)}
              />
              <Button type='submit' disabled={loading || !username.trim()}>
                {loading ? 'Loading' : 'Show'}
              </Button>
            </div>
            {listError && <p className='text-destructive text-sm'>{listError}</p>}
          </form>

          {loaded && listSummary && (
            <div className='flex flex-col gap-4'>
              <div className='flex flex-col gap-2'>
                {LIST_STATUS_META.map(({ code, label, color }) => (
                  <div
                    className='flex flex-row items-center gap-3 text-sm'
                    key={code}
                  >
                    <span
                      className='size-3 rounded-full'
                      style={{ backgroundColor: color }}
                    />
                    <span className='grow'>{label}</span>
                    <span className='font-medium tabular-nums'>
                      {listSummary.counts[code] ?? 0}
                    </span>
                  </div>
                ))}
              </div>

              <div className='flex flex-col gap-1 text-foreground/60 text-xs'>
                <p>
                  {listSummary.matched} of {listTotal} entries are marked on the
                  wall.
                </p>
                {listSummary.outside > 0 && (
                  <p>
                    {listSummary.outside} sit past the wall size you picked -
                    raise it under Anime in settings to see them.
                  </p>
                )}
                {listSummary.missing > 0 && (
                  <p>
                    {listSummary.missing} are not on this wall at all (hentai is
                    left out, and a few titles carry no MyAnimeList id).
                  </p>
                )}
              </div>

              <div className='flex flex-row items-center justify-between gap-3'>
                <Label htmlFor='list-dim'>Fade everything else</Label>
                <Switch
                  id='list-dim'
                  checked={listDimOthers}
                  onCheckedChange={setListDimOthers}
                />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </Modal>
  )
}
