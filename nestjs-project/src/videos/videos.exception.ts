import { DomainException } from '../common/exceptions/domain.exception';

export class VideoNotFoundException extends DomainException {
  constructor() {
    super('VIDEO_NOT_FOUND', 404, 'Video not found');
  }
}

export class VideoNotPublishedException extends DomainException {
  constructor() {
    super('VIDEO_NOT_PUBLISHED', 404, 'Video is not published yet');
  }
}

export class VideoNotOwnedException extends DomainException {
  constructor() {
    super('VIDEO_NOT_OWNED', 403, 'You do not own this video');
  }
}

export class VideoUploadAlreadyInitiatedException extends DomainException {
  constructor() {
    super(
      'VIDEO_UPLOAD_ALREADY_INITIATED',
      409,
      'An upload is already initiated for this video',
    );
  }
}

export class VideoUploadNotInitiatedException extends DomainException {
  constructor() {
    super(
      'VIDEO_UPLOAD_NOT_INITIATED',
      400,
      'A multipart upload has not been initiated for this video',
    );
  }
}

export class VideoUploadPartsIncompleteException extends DomainException {
  constructor() {
    super(
      'VIDEO_UPLOAD_PARTS_INCOMPLETE',
      400,
      'All upload parts must be included to complete the upload',
    );
  }
}

export class VideoProcessingException extends DomainException {
  constructor() {
    super('VIDEO_PROCESSING_FAILED', 500, 'Failed to process the video');
  }
}

export class VideoUploadTooLargeException extends DomainException {
  constructor() {
    super('VIDEO_UPLOAD_TOO_LARGE', 413, 'Video file exceeds the 10GB limit');
  }
}
