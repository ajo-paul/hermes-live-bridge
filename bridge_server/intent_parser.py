from typing import Optional, Any, Dict

def parse_intent(message: Any) -> Optional[Dict[str, Any]]:
    """
    Parses a message from Gemini Flash Live API to detect a tool call for the Hermes Agent.
    
    Returns a dictionary containing 'prompt' and 'call_id' if a valid tool call is found,
    otherwise returns None.
    """
    if not isinstance(message, dict):
        return None

    # The Gemini Live API typically sends tool calls within 'tool_call' or 'server_content'
    # We check for tool_call first.
    tool_call = message.get("tool_call")
    if not tool_call:
        return None

    function_calls = tool_call.get("function_calls", [])
    for call in function_calls:
        if call.get("name") == "execute_hermes_task":
            args = call.get("args", {})
            prompt = args.get("prompt")
            call_id = call.get("id")
            if prompt:
                return {"prompt": prompt, "call_id": call_id}

    return None
