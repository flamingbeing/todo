// The places last opened, newest first, kept per device in the recentPlaces setting for Search's "Recently visited".
// Its own small file with no imports, so the first screen (views.js) can note a place without loading Search.
/** the places last opened with this one first (at most 6, no repeats): 'inbox', 'today', 'upcoming', 'filters' (Filters & Labels),
 * 'project:<id>', 'labels:<id>' or 'filters:<id>' @param {string[]} recent @param {string} place */
export const rememberPlace = (recent, place) => {
  const v = String(place ?? '').slice(0, 80);
  return v ? [v, ...recent.filter(x => x !== v)].slice(0, 6) : recent.slice(0, 6);
};
