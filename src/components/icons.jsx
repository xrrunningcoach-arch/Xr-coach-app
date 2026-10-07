// Iconos de línea (SVG inline, sin librerías). Heredan el color del texto.
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

const make = (children) =>
  function Icon(props) {
    return <svg {...base} {...props}>{children}</svg>
  }

export const IconCalendar = make(
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </>
)
export const IconChart = make(
  <>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <rect x="8" y="12" width="3" height="5" />
    <rect x="13.5" y="8" width="3" height="9" />
  </>
)
export const IconTarget = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" />
  </>
)
export const IconHeart = make(<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20Z" />)
export const IconFlag = make(
  <>
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5" />
  </>
)
export const IconUser = make(
  <>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </>
)
export const IconChat = make(<path d="M4 5.5h16v10H9.5L5 19.5v-4H4Z" />)
export const IconLibrary = make(
  <>
    <path d="M5 4v16M10 4v16" />
    <path d="m14.5 5.2 4.2-1.1 3 14.7-4.2 1.1Z" />
  </>
)
export const IconChevronLeft = make(<path d="m14.5 6-6 6 6 6" />)
export const IconChevronRight = make(<path d="m9.5 6 6 6-6 6" />)
export const IconPlus = make(<path d="M12 5v14M5 12h14" />)
export const IconPanel = make(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M9.5 4.5v15" />
  </>
)
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7.5" />)
export const IconClose = make(<path d="M6 6l12 12M18 6 6 18" />)
export const IconSun = make(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
  </>
)
export const IconMoon = make(<path d="M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />)
export const IconHome = make(
  <>
    <path d="M4 11 12 4l8 7" />
    <path d="M6 10v9.5h12V10" />
    <path d="M10 19.5v-5h4v5" />
  </>
)
export const IconMore = make(
  <>
    <circle cx="5.5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="18.5" cy="12" r="1.4" />
  </>
)
export const IconBook = make(
  <>
    <path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3Z" />
    <path d="M5 17a3 3 0 0 1 3-3h10" />
  </>
)
export const IconUsers = make(
  <>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5" />
    <path d="M16 5.6a3.2 3.2 0 0 1 0 5.8M18 14.8c1.7.7 2.7 2.2 3 4.7" />
  </>
)
export const IconAlert = make(
  <>
    <path d="M12 3.5 21.5 20h-19Z" />
    <path d="M12 10v4.5M12 17.2v.1" />
  </>
)
export const IconClock = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>
)
