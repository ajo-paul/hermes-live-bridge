import os

# Must match the PROJECT_ROOT in agent_controller.py
PROJECT_ROOT = os.getenv("PROJECT_ROOT", "/app/hermes-live-bridge")
PROTECTED_FILES = {
    "agent_controller.py",
    "main.py",
    ".env",
    "docker-compose.yml",
    "Dockerfile"
}

def tool_smart_edit(args):
    path = args.get("path")
    search_block = args.get("search_block") or args.get("old_string")
    replace_block = args.get("replace_block") or args.get("new_string")
    
    if not all([path, search_block, replace_block]):
        return {"error": "Missing required arguments: path, search_block, replace_block"}
    
    # Path sandboxing
    abs_path = os.path.abspath(os.path.join(PROJECT_ROOT, path))
    if not abs_path.startswith(PROJECT_ROOT):
        return {"error": f"Access denied: Path {path} is outside the project root."}
    
    filename = os.path.basename(abs_path)
    if filename in PROTECTED_FILES:
        return {"error": f"Access denied: {filename} is a protected system file."}
    
    try:
        with open(abs_path, "r") as f:
            content = f.read()
        
        # Robust match: Normalize trailing whitespace on each line for the search block
        def normalize(text):
            return "\n".join([line.rstrip() for line in text.splitlines()])

        normalized_content = normalize(content)
        normalized_search = normalize(search_block)
        
        if normalized_search not in normalized_content:
            return {"error": f"Search block not found in {abs_path}. Please ensure the block matches the file content exactly (ignoring trailing whitespace)."}
        
        # Find the actual index in the original content that corresponds to the normalized match
        # This is tricky. For simplicity, we'll find the start and end of the block.
        start_idx = normalized_content.find(normalized_search)
        
        # We need to map the normalized index back to the original content index.
        # A simpler, more robust way for this 'clean slate' is to use the block match
        # and replace it. To avoid the complexity of index mapping, we'll use the 
        # exact search_block if it exists, otherwise fall back to a more fuzzy match.
        
        if search_block in content:
            new_content = content.replace(search_block, replace_block, 1)
        else:
            # If exact match fails but normalized match succeeds, we use the normalized match
            # to find the lines and replace them.
            lines = content.splitlines(keepends=True)
            search_lines = normalized_search.splitlines()
            
            found = False
            for i in range(len(lines) - len(search_lines) + 1):
                current_block = "".join(lines[i:i+len(search_lines)])
                if normalize(current_block) == normalized_search:
                    # Found the block! Replace these lines.
                    lines[i:i+len(search_lines)] = [replace_block + ("\n" if not replace_block.endswith("\n") else "")]
                    found = True
                    break
            
            if not found:
                return {"error": "Search block match found in normalized content but could not be applied to original file."}
            new_content = "".join(lines)
            
        with open(abs_path, "w") as f:
            f.write(new_content)
            
        return {
            "status": "success",
            "message": f"Successfully replaced search block with replace block in {abs_path}",
            "diff": "Block-based replacement applied successfully."
        }
    except Exception as e:
        return {"error": str(e)}
