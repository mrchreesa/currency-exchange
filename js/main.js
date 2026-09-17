(() => {
  'use strict';

  /* ---------- Header: shadow once the page scrolls ---------- */
  const header = document.querySelector('.site-header');
  const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 4);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  /* ---------- Mobile menu ---------- */
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-nav');
  const desktop = window.matchMedia('(min-width: 880px)');

  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.sr-only').textContent = open ? 'Close menu' : 'Menu';
    nav.classList.toggle('is-open', open);
  };

  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      setMenu(false);
      toggle.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (nav.classList.contains('is-open') && !header.contains(event.target)) setMenu(false);
  });
  desktop.addEventListener('change', (event) => {
    if (event.matches) setMenu(false);
  });

  /* ---------- Branch map ---------- */
  const mapEl = document.getElementById('branch-map');
  if (!mapEl) return;

  if (!window.maplibregl) {
    mapEl.classList.add('map--fallback');
    mapEl.textContent = 'The map could not load. Use “Open in Google Maps” instead.';
    return;
  }

  // Placeholder location in central London. Replace with the real branch coordinates.
  const branch = [Number(mapEl.dataset.lng), Number(mapEl.dataset.lat)];

  const map = new maplibregl.Map({
    container: mapEl,
    // OpenFreeMap: free vector tiles, no API key. Recoloured below to match the design.
    style: 'https://tiles.openfreemap.org/styles/positron',
    center: branch,
    zoom: 12.9,
    minZoom: 10,
    maxZoom: 18,
    attributionControl: { compact: true },
    cooperativeGestures: true, // page scroll isn't hijacked; ctrl/⌘ + scroll or two fingers to move the map
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });

  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  // Sit the pin a little left of centre and above the middle, as in the mockup.
  map.setPadding({ top: 0, left: 0, right: 40, bottom: 44 });

  map.on('style.load', () => applyMapColours(map));

  // Keep the attribution tucked behind its (i) button until someone asks for it.
  map.once('load', () => {
    mapEl.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  });

  const pin = document.createElement('div');
  pin.className = 'branch-marker';
  pin.innerHTML =
    '<svg aria-hidden="true"><use href="#i-pin"/></svg>' +
    '<span class="branch-marker__label">Our branch</span>';
  new maplibregl.Marker({ element: pin, anchor: 'bottom' }).setLngLat(branch).addTo(map);

  function applyMapColours(m) {
    const palette = {
      land: '#ecebe6',
      park: '#cde3bf',
      water: '#a9d1e8',
      road: '#ffffff',
      roadCasing: '#dddbd4',
      mainRoad: '#fcf1d4',
      label: '#8c918a',
      labelHalo: '#f5f4f0',
    };

    const paint = (id, prop, value) => { if (m.getLayer(id)) m.setPaintProperty(id, prop, value); };
    const hide = (id) => { if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'none'); };

    paint('background', 'background-color', palette.land);
    paint('landuse_residential', 'fill-color', palette.land);
    paint('park', 'fill-color', palette.park);
    paint('park', 'fill-opacity', 1);
    paint('landcover_wood', 'fill-color', palette.park);
    paint('landcover_wood', 'fill-opacity', 1);
    paint('water', 'fill-color', palette.water);
    paint('waterway', 'line-color', palette.water);
    hide('building');

    ['highway_path', 'highway_minor', 'highway_major_inner', 'highway_major_subtle', 'highway_motorway_subtle']
      .forEach((id) => paint(id, 'line-color', palette.road));
    ['highway_major_casing', 'highway_motorway_casing', 'highway_motorway_bridge_casing']
      .forEach((id) => paint(id, 'line-color', palette.roadCasing));
    ['highway_motorway_inner', 'highway_motorway_bridge_inner']
      .forEach((id) => paint(id, 'line-color', palette.mainRoad));

    ['highway-shield-non-us', 'highway-shield-us-interstate', 'road_shield_us', 'airport',
      'label_city', 'label_city_capital', 'label_state', 'label_country_1', 'label_country_2', 'label_country_3']
      .forEach(hide);

    m.getStyle().layers
      .filter((layer) => layer.type === 'symbol')
      .forEach((layer) => {
        paint(layer.id, 'text-color', layer.id.startsWith('water') ? '#6f97ad' : palette.label);
        paint(layer.id, 'text-halo-color', palette.labelHalo);
      });
  }
})();
