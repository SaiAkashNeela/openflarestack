export class ConversationRoom implements DurableObject {
  state: DurableObjectState
  constructor(state: DurableObjectState) { this.state = state }
  async fetch(request: Request): Promise<Response> {
    return new Response('TODO', { status: 200 })
  }
}
