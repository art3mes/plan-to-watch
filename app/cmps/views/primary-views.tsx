import { About } from './about'
import { Favorites } from './favorites'
import { FilmPreview, FilmViewDrawer } from './film'
import { HotkeysView } from './hotkeys'
import { LowFpsAlert } from './low-fps-alert'
import { MyList } from './my-list'
import { Settings } from './settings'

const PrimaryViews = () => (
  <>
    <Settings />
    <About />
    <Favorites />
    <MyList />
    <FilmPreview />
    <FilmViewDrawer />
    <LowFpsAlert />
    <HotkeysView />
  </>
)

export default PrimaryViews
