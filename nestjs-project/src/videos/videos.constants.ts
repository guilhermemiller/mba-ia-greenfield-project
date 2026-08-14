export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 * 1024; // 10GB

export const PART_SIZE_BYTES = 50 * 1024 * 1024; // 50MB per part

// Video source object keys live under a per-video directory, keyed by the
// unique video id, so each video has non-conflicting storage.
export const SOURCE_KEY_PREFIX = 'videos';
export const THUMBNAIL_KEY_PREFIX = 'thumbnails';
