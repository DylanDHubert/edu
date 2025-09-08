# Assistant Prompts

This folder contains the system prompts used by the HHB AI assistants.

## Files

### `assistant-instructions.txt`
The main system prompt template for all AI assistants. This prompt defines:
- The assistant's role and personality
- How to handle different types of queries
- Response formatting requirements
- Knowledge source priorities
- Accuracy and citation rules

## Usage

The prompt template uses the placeholder `{PORTFOLIO_NAME}` which gets replaced with the actual portfolio name (HIP, KNEE, or TS KNEE) when creating assistants.

## Editing

To modify the assistant behavior:
1. Edit `assistant-instructions.txt`
2. Save the file
3. The changes will take effect for newly created assistants

**Note**: Existing assistants will continue using their original prompts until they are recreated.

## Template Variables

- `{PORTFOLIO_NAME}` - Replaced with the portfolio name (HIP, KNEE, TS KNEE)
