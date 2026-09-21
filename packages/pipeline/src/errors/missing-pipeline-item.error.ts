/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** A required context item is absent or contains undefined. */
export class MissingPipelineItemError extends Error {
  constructor(
    readonly itemName: string,
    readonly requestName: string,
    readonly handlerName: string,
    customMessage?: string,
  ) {
    super(
      `Missing pipeline item "${itemName}" for request "${requestName}" in handler "${handlerName}". Populate the item before reading it with requirePipelineItem.` +
        (customMessage ? ` ${customMessage}` : ''),
    );
    this.name = MissingPipelineItemError.name;
  }
}
