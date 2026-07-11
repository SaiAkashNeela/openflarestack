export class ConversationRoom implements DurableObject {
  private readonly state: DurableObjectState
  constructor(state: DurableObjectState, _env: unknown) { this.state = state }
  async fetch(request: Request): Promise<Response> {
    return new Response('TODO', { status: 200 })
  }
}
