import * as frame from '@farcaster/frame-sdk'

export async function initializeFrame() {
  await frame.sdk.actions.ready();
}