const mediaConfig = {
  enabled: true,
  baseUrl: import.meta.env.VITE_TEXTURES_BASE_URL ?? '/media',
  preload: 'first', // 'v0', 'first' or false
  compressionFormat: 'dds', // or 'ktx'
  versions: [
    {
      cols: 512,
      rows: 104,
      width: 2048,
      height: 624,
      layers: Number.parseInt(import.meta.env.VITE_MEDIA_VERSION_0_LAYERS) ?? 1,
      layerSrcFormat: '/low/{EXT}/{INDEX}.{EXT}',
      type: 'compressed-grid',
    },
    {
      cols: 90,
      rows: 60,
      width: 1980,
      height: 1980,
      layers:
        Number.parseInt(import.meta.env.VITE_MEDIA_VERSION_1_LAYERS) ?? 10,
      layerSrcFormat: '/mid/{EXT}/{INDEX}.{EXT}',
      type: 'compressed-grid',
    },
    {
      cols: 18,
      rows: 12,
      width: 1980,
      height: 1980,
      layers:
        Number.parseInt(import.meta.env.VITE_MEDIA_VERSION_2_LAYERS) ?? 241,
      layerSrcFormat: '/high/{EXT}/{INDEX}.{EXT}',
      type: 'compressed-grid',
    },
  ],
}

export default mediaConfig

export const uncompressedSingleMediaVersionConfig = {
  // The focused cell's full-resolution posters. Upstream loaded one 220x330
  // image per title and packed them into 9x6 virtual layers on the GPU; here the
  // same 9x6 layout arrives pre-packed as a sheet, so cols/rows of 9x6 make the
  // engine's layer index the sheet number. 21,472 single files would exceed
  // Cloudflare Pages' file limit; 398 sheets do not.
  cols: 9,
  rows: 6,
  virtualCols: 9,
  virtualRows: 6,
  tileWidth: 220,
  tileHeight: 330,
  width: 1980,
  height: 1980,

  layers: Number.parseInt(import.meta.env.VITE_MEDIA_VERSION_3_LAYERS) || 398,
  virtualLayers: 50,
  layerIndexStart: 0,
  layerSrcFormat: '/poster-sheets/{INDEX}.jpg',
  type: 'uncompressed-single',
  sheets: true,
}

export const mediaConfigWithUncompressedSingleVersion = {
  ...mediaConfig,
  versions: [
    ...mediaConfig.versions,
    ...(import.meta.env.VITE_EXPERIMENTAL_MEDIA_VERSION_3_ENABLED
      ? [uncompressedSingleMediaVersionConfig]
      : []),
  ],
}
