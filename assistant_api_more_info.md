Assistants API overview

Beta

===============================

Build AI Assistants with essential tools and integrations.

Based on your feedback from the Assistants API beta, we've incorporated key improvements into the Responses API. After we achieve full feature parity, we will announce a **deprecation plan** later this year, with a target sunset date in the first half of 2026. [Learn more](/docs/guides/responses-vs-chat-completions).

Overview
--------

The Assistants API allows you to build AI assistants within your own applications. An Assistant has instructions and can leverage models, tools, and files to respond to user queries.

The Assistants API currently supports three types of [tools](/docs/assistants/tools): Code Interpreter, File Search, and Function calling.

You can explore the capabilities of the Assistants API using the [Assistants playground](/playground?mode=assistant) or by building a step-by-step integration outlined in our [Assistants API quickstart](/docs/assistants/quickstart).

How assistants work
-------------------

The Assistants API is designed to help developers build powerful AI assistants capable of performing a variety of tasks.

1.  Assistants can call OpenAI’s **[models](/docs/models)** with specific instructions to tune their personality and capabilities.
2.  Assistants can access **multiple tools in parallel**. These can be both OpenAI built-in tools — like [code\_interpreter](/docs/assistants/tools/code-interpreter) and [file\_search](/docs/assistants/tools/file-search) — or tools you build / host (via [function calling](/docs/assistants/tools/function-calling)).
3.  Assistants can access **persistent Threads**. Threads simplify AI application development by storing message history and truncating it when the conversation gets too long for the model’s context length. You create a Thread once, and simply append Messages to it as your users reply.
4.  Assistants can access files in several formats — either as part of their creation or as part of Threads between Assistants and users. When using tools, Assistants can also create files (e.g., images, spreadsheets, etc) and cite files they reference in the Messages they create.

Objects
-------

![Assistants object architecture diagram](https://cdn.openai.com/API/docs/images/diagram-assistant.webp)

|Object|What it represents|
|---|---|
|Assistant|Purpose-built AI that uses OpenAI’s models and calls tools|
|Thread|A conversation session between an Assistant and a user. Threads store Messages and automatically handle truncation to fit content into a model’s context.|
|Message|A message created by an Assistant or a user. Messages can include text, images, and other files. Messages stored as a list on the Thread.|
|Run|An invocation of an Assistant on a Thread. The Assistant uses its configuration and the Thread’s Messages to perform tasks by calling models and tools. As part of a Run, the Assistant appends Messages to the Thread.|
|Run Step|A detailed list of steps the Assistant took as part of a Run. An Assistant can call tools or create Messages during its run. Examining Run Steps allows you to introspect how the Assistant is getting to its final results.

Assistants API quickstart

Beta

=================================

Step-by-step guide to creating an assistant.

Based on your feedback from the Assistants API beta, we've incorporated key improvements into the Responses API. After we achieve full feature parity, we will announce a **deprecation plan** later this year, with a target sunset date in the first half of 2026. [Learn more](/docs/guides/responses-vs-chat-completions).

Overview
--------

A typical integration of the Assistants API has the following flow:

1.  Create an [Assistant](/docs/api-reference/assistants/createAssistant) by defining its custom instructions and picking a model. If helpful, add files and enable tools like Code Interpreter, File Search, and Function calling.
2.  Create a [Thread](/docs/api-reference/threads) when a user starts a conversation.
3.  Add [Messages](/docs/api-reference/messages) to the Thread as the user asks questions.
4.  [Run](/docs/api-reference/runs) the Assistant on the Thread to generate a response by calling the model and the tools.

This starter guide walks through the key steps to create and run an Assistant that uses [Code Interpreter](/docs/assistants/tools/code-interpreter). In this example, we're [creating an Assistant](/docs/api-reference/assistants/createAssistant) that is a personal math tutor, with the Code Interpreter tool enabled.

Calls to the Assistants API require that you pass a beta HTTP header. This is handled automatically if you’re using OpenAI’s official Python or Node.js SDKs. `OpenAI-Beta: assistants=v2`

Step 1: Create an Assistant
---------------------------

An [Assistant](/docs/api-reference/assistants/object) represents an entity that can be configured to respond to a user's messages using several parameters like `model`, `instructions`, and `tools`.

Create an Assistant

```python
from openai import OpenAI
client = OpenAI()

assistant = client.beta.assistants.create(
  name="Math Tutor",
  instructions="You are a personal math tutor. Write and run code to answer math questions.",
  tools=[{"type": "code_interpreter"}],
  model="gpt-4o",
)
```

```javascript
import OpenAI from "openai";
const openai = new OpenAI();

async function main() {
  const assistant = await openai.beta.assistants.create({
    name: "Math Tutor",
    instructions: "You are a personal math tutor. Write and run code to answer math questions.",
    tools: [{ type: "code_interpreter" }],
    model: "gpt-4o"
  });
}

main();
```

```bash
curl "https://api.openai.com/v1/assistants" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "OpenAI-Beta: assistants=v2" \
  -d '{
    "instructions": "You are a personal math tutor. Write and run code to answer math questions.",
    "name": "Math Tutor",
    "tools": [{"type": "code_interpreter"}],
    "model": "gpt-4o"
  }'
```

Step 2: Create a Thread
-----------------------

A [Thread](/docs/api-reference/threads/object) represents a conversation between a user and one or many Assistants. You can create a Thread when a user (or your AI application) starts a conversation with your Assistant.

Create a Thread

```python
thread = client.beta.threads.create()
```

```javascript
const thread = await openai.beta.threads.create();
```

```bash
curl https://api.openai.com/v1/threads \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "OpenAI-Beta: assistants=v2" \
  -d ''
```

Step 3: Add a Message to the Thread
-----------------------------------

The contents of the messages your users or applications create are added as [Message](/docs/api-reference/messages/object) objects to the Thread. Messages can contain both text and files. There is a limit of 100,000 Messages per Thread and we smartly truncate any context that does not fit into the model's context window.

Add a Message to the Thread

```python
message = client.beta.threads.messages.create(
  thread_id=thread.id,
  role="user",
  content="I need to solve the equation `3x + 11 = 14`. Can you help me?"
)
```

```javascript
const message = await openai.beta.threads.messages.create(
  thread.id,
  {
    role: "user",
    content: "I need to solve the equation `3x + 11 = 14`. Can you help me?"
  }
);
```

```bash
curl https://api.openai.com/v1/threads/thread_abc123/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "OpenAI-Beta: assistants=v2" \
  -d '{
      "role": "user",
      "content": "I need to solve the equation `3x + 11 = 14`. Can you help me?"
    }'
```

Step 4: Create a Run
--------------------

Once all the user Messages have been added to the Thread, you can [Run](/docs/api-reference/runs/object) the Thread with any Assistant. Creating a Run uses the model and tools associated with the Assistant to generate a response. These responses are added to the Thread as `assistant` Messages.

With streaming

You can use the 'create and stream' helpers in the Python and Node SDKs to create a run and stream the response.

Create and Stream a Run

```python
from typing_extensions import override
from openai import AssistantEventHandler
 
# First, we create a EventHandler class to define
# how we want to handle the events in the response stream.
 
class EventHandler(AssistantEventHandler):    
  @override
  def on_text_created(self, text) -> None:
    print(f"\nassistant > ", end="", flush=True)
      
  @override
  def on_text_delta(self, delta, snapshot):
    print(delta.value, end="", flush=True)
      
  def on_tool_call_created(self, tool_call):
    print(f"\nassistant > {tool_call.type}\n", flush=True)
  
  def on_tool_call_delta(self, delta, snapshot):
    if delta.type == 'code_interpreter':
      if delta.code_interpreter.input:
        print(delta.code_interpreter.input, end="", flush=True)
      if delta.code_interpreter.outputs:
        print(f"\n\noutput >", flush=True)
        for output in delta.code_interpreter.outputs:
          if output.type == "logs":
            print(f"\n{output.logs}", flush=True)
 
# Then, we use the `stream` SDK helper 
# with the `EventHandler` class to create the Run 
# and stream the response.
 
with client.beta.threads.runs.stream(
  thread_id=thread.id,
  assistant_id=assistant.id,
  instructions="Please address the user as Jane Doe. The user has a premium account.",
  event_handler=EventHandler(),
) as stream:
  stream.until_done()
```

```javascript
// We use the stream SDK helper to create a run with
// streaming. The SDK provides helpful event listeners to handle 
// the streamed response.
 
const run = openai.beta.threads.runs.stream(thread.id, {
    assistant_id: assistant.id
  })
    .on('textCreated', (text) => process.stdout.write('\nassistant > '))
    .on('textDelta', (textDelta, snapshot) => process.stdout.write(textDelta.value))
    .on('toolCallCreated', (toolCall) => process.stdout.write(`\nassistant > ${toolCall.type}\n\n`))
    .on('toolCallDelta', (toolCallDelta, snapshot) => {
      if (toolCallDelta.type === 'code_interpreter') {
        if (toolCallDelta.code_interpreter.input) {
          process.stdout.write(toolCallDelta.code_interpreter.input);
        }
        if (toolCallDelta.code_interpreter.outputs) {
          process.stdout.write("\noutput >\n");
          toolCallDelta.code_interpreter.outputs.forEach(output => {
            if (output.type === "logs") {
              process.stdout.write(`\n${output.logs}\n`);
            }
          });
        }
      }
    });
```

See the full list of Assistants streaming events in our API reference [here](/docs/api-reference/assistants-streaming/events). You can also see a list of SDK event listeners for these events in the [Python](https://github.com/openai/openai-python/blob/main/helpers.md#assistant-events) & [Node](https://github.com/openai/openai-node/blob/master/helpers.md#assistant-events) repository documentation.

Without streaming

Runs are asynchronous, which means you'll want to monitor their `status` by polling the Run object until a [terminal status](/docs/assistants/deep-dive#runs-and-run-steps) is reached. For convenience, the 'create and poll' SDK helpers assist both in creating the run and then polling for its completion.

Create a Run

```python
run = client.beta.threads.runs.create_and_poll(
  thread_id=thread.id,
  assistant_id=assistant.id,
  instructions="Please address the user as Jane Doe. The user has a premium account."
)
```

```javascript
let run = await openai.beta.threads.runs.createAndPoll(
  thread.id,
  { 
    assistant_id: assistant.id,
    instructions: "Please address the user as Jane Doe. The user has a premium account."
  }
);
```

```bash
curl https://api.openai.com/v1/threads/thread_abc123/runs \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -H "OpenAI-Beta: assistants=v2" \
  -d '{
    "assistant_id": "asst_abc123",
    "instructions": "Please address the user as Jane Doe. The user has a premium account."
  }'
```

Once the Run completes, you can [list the Messages](/docs/api-reference/messages/listMessages) added to the Thread by the Assistant.

```python
if run.status == 'completed': 
  messages = client.beta.threads.messages.list(
    thread_id=thread.id
  )
  print(messages)
else:
  print(run.status)
```

```javascript
if (run.status === 'completed') {
  const messages = await openai.beta.threads.messages.list(
    run.thread_id
  );
  for (const message of messages.data.reverse()) {
    console.log(`${message.role} > ${message.content[0].text.value}`);
  }
} else {
  console.log(run.status);
}
```

```bash
curl https://api.openai.com/v1/threads/thread_abc123/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "OpenAI-Beta: assistants=v2"
```

You may also want to list the [Run Steps](/docs/api-reference/runs/listRunSteps) of this Run if you'd like to look at any tool calls made during this Run.

Next steps
----------

1.  Continue learning about Assistants Concepts in the [Deep Dive](/docs/assistants/deep-dive)
2.  Learn more about [Tools](/docs/assistants/tools)
3.  Explore the [Assistants playground](/playground?mode=assistant)
4.  Check out our [Assistants Quickstart app](https://github.com/openai/openai-assistants-quickstart) on github

Assistants API deep dive

Beta

================================

In-depth guide to creating and managing assistants.

Based on your feedback from the Assistants API beta, we've incorporated key improvements into the Responses API. After we achieve full feature parity, we will announce a **deprecation plan** later this year, with a target sunset date in the first half of 2026. [Learn more](/docs/guides/responses-vs-chat-completions).

Overview
--------

As described in the [Assistants Overview](/docs/assistants/overview), there are several concepts involved in building an app with the Assistants API.

This guide goes deeper into each of these concepts.

If you want to get started coding right away, check out the [Assistants API Quickstart](/docs/assistants/quickstart).

Creating Assistants
-------------------

We recommend using OpenAI's [latest models](/docs/models#gpt-4-turbo-and-gpt-4) with the Assistants API for best results and maximum compatibility with tools.

To get started, creating an Assistant only requires specifying the `model` to use. But you can further customize the behavior of the Assistant:

1.  Use the `instructions` parameter to guide the personality of the Assistant and define its goals. Instructions are similar to system messages in the Chat Completions API.
2.  Use the `tools` parameter to give the Assistant access to up to 128 tools. You can give it access to OpenAI built-in tools like `code_interpreter` and `file_search`, or call a third-party tools via a `function` calling.
3.  Use the `tool_resources` parameter to give the tools like `code_interpreter` and `file_search` access to files. Files are uploaded using the `File` [upload endpoint](/docs/api-reference/files/create) and must have the `purpose` set to `assistants` to be used with this API.

For example, to create an Assistant that can create data visualization based on a `.csv` file, first upload a file.

```python
file = client.files.create(
  file=open("revenue-forecast.csv", "rb"),
  purpose='assistants'
)
```

```javascript
const file = await openai.files.create({
  file: fs.createReadStream("revenue-forecast.csv"),
  purpose: "assistants",
});
```

```bash
curl https://api.openai.com/v1/files \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F purpose="assistants" \
  -F file="@revenue-forecast.csv"
```

Then, create the Assistant with the `code_interpreter` tool enabled and provide the file as a resource to the tool.

```python
assistant = client.beta.assistants.create(
  name="Data visualizer",
  description="You are great at creating beautiful data visualizations. You analyze data present in .csv files, understand trends, and come up with data visualizations relevant to those trends. You also share a brief text summary of the trends observed.",
  model="gpt-4o",
  tools=[{"type": "code_interpreter"}],
  tool_resources={
    "code_interpreter": {
      "file_ids": [file.id]
    }
  }
)
```

```javascript
const assistant = await openai.beta.assistants.create({
  name: "Data visualizer",
  description: "You are great at creating beautiful data visualizations. You analyze data present in .csv files, understand trends, and come up with data visualizations relevant to those trends. You also share a brief text summary of the trends observed.",
  model: "gpt-4o",
  tools: [{"type": "code_interpreter"}],
  tool_resources: {
    "code_interpreter": {
      "file_ids": [file.id]
    }
  }
});
```

```bash
curl https://api.openai.com/v1/assistants \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -H "OpenAI-Beta: assistants=v2" \
  -d '{
    "name": "Data visualizer",
    "description": "You are great at creating beautiful data visualizations. You analyze data present in .csv files, understand trends, and come up with data visualizations relevant to those trends. You also share a brief text summary of the trends observed.",
    "model": "gpt-4o",
    "tools": [{"type": "code_interpreter"}],
    "tool_resources": {
      "code_interpreter": {
        "file_ids": ["file-BK7bzQj3FfZFXr7DbL6xJwfo"]
      }
    }
  }'
```

You can attach a maximum of 20 files to `code_interpreter` and 10,000 files to `file_search` (using `vector_store` [objects](/docs/api-reference/vector-stores/object)).

Each file can be at most 512 MB in size and have a maximum of 5,000,000 tokens. By default, the size of all the files uploaded in your project cannot exceed 100 GB, but you can reach out to our support team to increase this limit.

Managing Threads and Messages
-----------------------------

Threads and Messages represent a conversation session between an Assistant and a user. There is a limit of 100,000 Messages per Thread. Once the size of the Messages exceeds the context window of the model, the Thread will attempt to smartly truncate messages, before fully dropping the ones it considers the least important.

You can create a Thread with an initial list of Messages like this:

```python
thread = client.beta.threads.create(
  messages=[
    {
      "role": "user",
      "content": "Create 3 data visualizations based on the trends in this file.",
      "attachments": [
        {
          "file_id": file.id,
          "tools": [{"type": "code_interpreter"}]
        }
      ]
    }
  ]
)
```

```javascript
const thread = await openai.beta.threads.create({
  messages: [
    {
      "role": "user",
      "content": "Create 3 data visualizations based on the trends in this file.",
      "attachments": [
        {
          file_id: file.id,
          tools: [{type: "code_interpreter"}]
        }
      ]
    }
  ]
});
```

```bash
curl https://api.openai.com/v1/threads \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -H "OpenAI-Beta: assistants=v2" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Create 3 data visualizations based on the trends in this file.",
        "attachments": [
          {
            "file_id": "file-ACq8OjcLQm2eIG0BvRM4z5qX",
            "tools": [{"type": "code_interpreter"}]
          }
        ]
      }
    ]
  }'
```

Messages can contain text, images, or file attachment. Message `attachments` are helper methods that add files to a thread's `tool_resources`. You can also choose to add files to the `thread.tool_resources` directly.

### Creating image input content

Message content can contain either external image URLs or File IDs uploaded via the [File API](/docs/api-reference/files/create). Only [models](/docs/models) with Vision support can accept image input. Supported image content types include png, jpg, gif, and webp. When creating image files, pass `purpose="vision"` to allow you to later download and display the input content. Currently, there is a 100GB limit per project. Please contact us to request a limit increase.

Tools cannot access image content unless specified. To pass image files to Code Interpreter, add the file ID in the message `attachments` list to allow the tool to read and analyze the input. Image URLs cannot be downloaded in Code Interpreter today.

```python
file = client.files.create(
  file=open("myimage.png", "rb"),
  purpose="vision"
)
thread = client.beta.threads.create(
  messages=[
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What is the difference between these images?"
        },
        {
          "type": "image_url",
          "image_url": {"url": "https://example.com/image.png"}
        },
        {
          "type": "image_file",
          "image_file": {"file_id": file.id}
        },
      ],
    }
  ]
)
```

```javascript
import fs from "fs";
const file = await openai.files.create({
  file: fs.createReadStream("myimage.png"),
  purpose: "vision",
});
const thread = await openai.beta.threads.create({
  messages: [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What is the difference between these images?"
        },
        {
          "type": "image_url",
          "image_url": {"url": "https://example.com/image.png"}
        },
        {
          "type": "image_file",
          "image_file": {"file_id": file.id}
        },
      ]
    }
  ]
});
```

```bash
# Upload a file with an "vision" purpose
curl https://api.openai.com/v1/files \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F purpose="vision" \
  -F file="@/path/to/myimage.png"

## Pass the file ID in the content
curl https://api.openai.com/v1/threads \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -H "OpenAI-Beta: assistants=v2" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "What is the difference between these images?"
          },
          {
            "type": "image_url",
            "image_url": {"url": "https://example.com/image.png"}
          },
          {
            "type": "image_file",
            "image_file": {"file_id": file.id}
          }
        ]
      }
    ]
  }'
```

#### Low or high fidelity image understanding

By controlling the `detail` parameter, which has three options, `low`, `high`, or `auto`, you have control over how the model processes the image and generates its textual understanding.

*   `low` will enable the "low res" mode. The model will receive a low-res 512px x 512px version of the image, and represent the image with a budget of 85 tokens. This allows the API to return faster responses and consume fewer input tokens for use cases that do not require high detail.
*   `high` will enable "high res" mode, which first allows the model to see the low res image and then creates detailed crops of input images based on the input image size. Use the [pricing calculator](https://openai.com/api/pricing/) to see token counts for various image sizes.

```python
thread = client.beta.threads.create(
  messages=[
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What is this an image of?"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/image.png",
            "detail": "high"
          }
        },
      ],
    }
  ]
)
```

```javascript
const thread = await openai.beta.threads.create({
  messages: [
    {
      "role": "user",
      "content": [
          {
            "type": "text",
            "text": "What is this an image of?"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "https://example.com/image.png",
              "detail": "high"
            }
          },
      ]
    }
  ]
});
```

```bash
curl https://api.openai.com/v1/threads \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -H "OpenAI-Beta: assistants=v2" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "What is this an image of?"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "https://example.com/image.png",
              "detail": "high"
            }
          },
        ]
      }
    ]
  }'
```

### Context window management

The Assistants API automatically manages the truncation to ensure it stays within the model's maximum context length. You can customize this behavior by specifying the maximum tokens you'd like a run to utilize and/or the maximum number of recent messages you'd like to include in a run.

#### Max Completion and Max Prompt Tokens

To control the token usage in a single Run, set `max_prompt_tokens` and `max_completion_tokens` when creating the Run. These limits apply to the total number of tokens used in all completions throughout the Run's lifecycle.

For example, initiating a Run with `max_prompt_tokens` set to 500 and `max_completion_tokens` set to 1000 means the first completion will truncate the thread to 500 tokens and cap the output at 1000 tokens. If only 200 prompt tokens and 300 completion tokens are used in the first completion, the second completion will have available limits of 300 prompt tokens and 700 completion tokens.

If a completion reaches the `max_completion_tokens` limit, the Run will terminate with a status of `incomplete`, and details will be provided in the `incomplete_details` field of the Run object.

When using the File Search tool, we recommend setting the max\_prompt\_tokens to no less than 20,000. For longer conversations or multiple interactions with File Search, consider increasing this limit to 50,000, or ideally, removing the max\_prompt\_tokens limits altogether to get the highest quality results.

#### Truncation Strategy

You may also specify a truncation strategy to control how your thread should be rendered into the model's context window. Using a truncation strategy of type `auto` will use OpenAI's default truncation strategy. Using a truncation strategy of type `last_messages` will allow you to specify the number of the most recent messages to include in the context window.

### Message annotations

Messages created by Assistants may contain [`annotations`](/docs/api-reference/messages/object#messages/object-content) within the `content` array of the object. Annotations provide information around how you should annotate the text in the Message.

There are two types of Annotations:

1.  `file_citation`: File citations are created by the [`file_search`](/docs/assistants/tools/file-search) tool and define references to a specific file that was uploaded and used by the Assistant to generate the response.
2.  `file_path`: File path annotations are created by the [`code_interpreter`](/docs/assistants/tools/code-interpreter) tool and contain references to the files generated by the tool.

When annotations are present in the Message object, you'll see illegible model-generated substrings in the text that you should replace with the annotations. These strings may look something like `【13†source】` or `sandbox:/mnt/data/file.csv`. Here’s an example python code snippet that replaces these strings with the annotations.

```python
# Retrieve the message object
message = client.beta.threads.messages.retrieve(
  thread_id="...",
  message_id="..."
)

# Extract the message content
message_content = message.content[0].text
annotations = message_content.annotations
citations = []

# Iterate over the annotations and add footnotes
for index, annotation in enumerate(annotations):
    # Replace the text with a footnote
    message_content.value = message_content.value.replace(annotation.text, f' [{index}]')
    
    # Gather citations based on annotation attributes
    if (file_citation := getattr(annotation, 'file_citation', None)):
        cited_file = client.files.retrieve(file_citation.file_id)
        citations.append(f'[{index}] {file_citation.quote} from {cited_file.filename}')
    elif (file_path := getattr(annotation, 'file_path', None)):
        cited_file = client.files.retrieve(file_path.file_id)
        citations.append(f'[{index}] Click <here> to download {cited_file.filename}')
        # Note: File download functionality not implemented above for brevity

# Add footnotes to the end of the message before displaying to user
message_content.value += '\n' + '\n'.join(citations)
```

Runs and Run Steps
------------------

When you have all the context you need from your user in the Thread, you can run the Thread with an Assistant of your choice.

```python
run = client.beta.threads.runs.create(
  thread_id=thread.id,
  assistant_id=assistant.id
)
```

```javascript
const run = await openai.beta.threads.runs.create(
  thread.id,
  { assistant_id: assistant.id }
);
```

```bash
curl https://api.openai.com/v1/threads/THREAD_ID/runs \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -H "OpenAI-Beta: assistants=v2" \
  -d '{
    "assistant_id": "asst_ToSF7Gb04YMj8AMMm50ZLLtY"
  }'
```

By default, a Run will use the `model` and `tools` configuration specified in Assistant object, but you can override most of these when creating the Run for added flexibility:

```python
run = client.beta.threads.runs.create(
  thread_id=thread.id,
  assistant_id=assistant.id,
  model="gpt-4o",
  instructions="New instructions that override the Assistant instructions",
  tools=[{"type": "code_interpreter"}, {"type": "file_search"}]
)
```

```javascript
const run = await openai.beta.threads.runs.create(
  thread.id,
  {
    assistant_id: assistant.id,
    model: "gpt-4o",
    instructions: "New instructions that override the Assistant instructions",
    tools: [{"type": "code_interpreter"}, {"type": "file_search"}]
  }
);
```

```bash
curl https://api.openai.com/v1/threads/THREAD_ID/runs \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -H "OpenAI-Beta: assistants=v2" \
  -d '{
    "assistant_id": "ASSISTANT_ID",
    "model": "gpt-4o",
    "instructions": "New instructions that override the Assistant instructions",
    "tools": [{"type": "code_interpreter"}, {"type": "file_search"}]
  }'
```

Note: `tool_resources` associated with the Assistant cannot be overridden during Run creation. You must use the [modify Assistant](/docs/api-reference/assistants/modifyAssistant) endpoint to do this.

#### Run lifecycle

Run objects can have multiple statuses.

![Run lifecycle - diagram showing possible status transitions](https://cdn.openai.com/API/docs/images/diagram-run-statuses-v2.png)

|Status|Definition|
|---|---|
|queued|When Runs are first created or when you complete the required_action, they are moved to a queued status. They should almost immediately move to in_progress.|
|in_progress|While in_progress, the Assistant uses the model and tools to perform steps. You can view progress being made by the Run by examining the Run Steps.|
|completed|The Run successfully completed! You can now view all Messages the Assistant added to the Thread, and all the steps the Run took. You can also continue the conversation by adding more user Messages to the Thread and creating another Run.|
|requires_action|When using the Function calling tool, the Run will move to a required_action state once the model determines the names and arguments of the functions to be called. You must then run those functions and submit the outputs before the run proceeds. If the outputs are not provided before the expires_at timestamp passes (roughly 10 mins past creation), the run will move to an expired status.|
|expired|This happens when the function calling outputs were not submitted before expires_at and the run expires. Additionally, if the runs take too long to execute and go beyond the time stated in expires_at, our systems will expire the run.|
|cancelling|You can attempt to cancel an in_progress run using the Cancel Run endpoint. Once the attempt to cancel succeeds, status of the Run moves to cancelled. Cancellation is attempted but not guaranteed.|
|cancelled|Run was successfully cancelled.|
|failed|You can view the reason for the failure by looking at the last_error object in the Run. The timestamp for the failure will be recorded under failed_at.|
|incomplete|Run ended due to max_prompt_tokens or max_completion_tokens reached. You can view the specific reason by looking at the incomplete_details object in the Run.|

#### Polling for updates

If you are not using [streaming](/docs/assistants/overview#step-4-create-a-run?context=with-streaming), in order to keep the status of your run up to date, you will have to periodically [retrieve the Run](/docs/api-reference/runs/getRun) object. You can check the status of the run each time you retrieve the object to determine what your application should do next.

You can optionally use Polling Helpers in our [Node](https://github.com/openai/openai-node?tab=readme-ov-file#polling-helpers) and [Python](https://github.com/openai/openai-python?tab=readme-ov-file#polling-helpers) SDKs to help you with this. These helpers will automatically poll the Run object for you and return the Run object when it's in a terminal state.

#### Thread locks

When a Run is `in_progress` and not in a terminal state, the Thread is locked. This means that:

*   New Messages cannot be added to the Thread.
*   New Runs cannot be created on the Thread.

#### Run steps

![Run steps lifecycle - diagram showing possible status transitions](https://cdn.openai.com/API/docs/images/diagram-2.png)

Run step statuses have the same meaning as Run statuses.

Most of the interesting detail in the Run Step object lives in the `step_details` field. There can be two types of step details:

1.  `message_creation`: This Run Step is created when the Assistant creates a Message on the Thread.
2.  `tool_calls`: This Run Step is created when the Assistant calls a tool. Details around this are covered in the relevant sections of the [Tools](/docs/assistants/tools) guide.

Data Access Guidance
--------------------

Currently, Assistants, Threads, Messages, and Vector Stores created via the API are scoped to the Project they're created in. As such, any person with API key access to that Project is able to read or write Assistants, Threads, Messages, and Runs in the Project.

We strongly recommend the following data access controls:

*   _Implement authorization._ Before performing reads or writes on Assistants, Threads, Messages, and Vector Stores, ensure that the end-user is authorized to do so. For example, store in your database the object IDs that the end-user has access to, and check it before fetching the object ID with the API.
*   _Restrict API key access._ Carefully consider who in your organization should have API keys and be part of a Project. Periodically audit this list. API keys enable a wide range of operations including reading and modifying sensitive information, such as Messages and Files.
*   _Create separate accounts._ Consider creating separate Projects for different applications in order to isolate data across multiple applications.

Assistants API tools

Beta

============================

Explore tools for file search, code, and function calling.

Based on your feedback from the Assistants API beta, we've incorporated key improvements into the Responses API. After we achieve full feature parity, we will announce a **deprecation plan** later this year, with a target sunset date in the first half of 2026. [Learn more](/docs/guides/responses-vs-chat-completions).

Overview
--------

Assistants created using the Assistants API can be equipped with tools that allow them to perform more complex tasks or interact with your application. We provide built-in tools for assistants, but you can also define your own tools to extend their capabilities using Function Calling.

The Assistants API currently supports the following tools:

[

File Search

Built-in RAG tool to process and search through files

](/docs/assistants/tools/file-search)[

Code Interpreter

Write and run python code, process files and diverse data

](/docs/assistants/tools/code-interpreter)[

Function Calling

Use your own custom functions to interact with your application

](/docs/assistants/tools/function-calling)

Next steps
----------

*   See the API reference to [submit tool outputs](/docs/api-reference/runs/submitToolOutputs)
*   Build a tool-using assistant with our [Quickstart app](https://github.com/openai/openai-assistants-quickstart)

What's new in Assistants API

Beta

====================================

Discover new features and improvements in Assistants API.

March 2025
----------

Based on developer feedback from the Assistants API beta, we've incorporated key improvements into the [Responses API](/docs/guides/responses-vs-chat-completions), making it more flexible, faster, and easier to use.

*   We launched the Responses API, a new API primitive with built-in tools, like function calling, file search, web search, and computer use.
*   We're working to achieve full feature parity between the Assistants and the Responses API, including support for Assistant-like and Thread-like objects and the Code Interpreter tool. We will communicate updates to the Assistants API in the [changelog](/docs/changelog).
*   After achieving full feature parity, we plan to formally announce the deprecation of the Assistants API with a target sunset date in the first half of 2026. Upon deprecation, we will provide a clear migration guide from the Assistants API to the Responses API that allows developers to preserve all their data and migrate their applications.
*   Until we formally announce the deprecation, we will continue delivering new models to the Assistants API. The Responses API represents the future direction for building agents on OpenAI.

April 2024
----------

We are announcing a variety of new features and improvements to the Assistants API and moving our Beta to a new API version, `OpenAI-Beta: assistants=v2`. Here's what's new:

*   We're launching an [improved retrieval tool called `file_search`](/docs/assistants/tools/file-search), which can ingest up to 10,000 files per assistant - 500x more than before. It is faster, supports parallel queries through multi-threaded searches, and features enhanced reranking and query rewriting.
*   Alongside `file_search`, we're introducing [`vector_store` objects](/docs/assistants/tools/file-search#vector-stores) in the API. Once a file is added to a vector store, it's automatically parsed, chunked, and embedded, made ready to be searched. Vector stores can be used across assistants and threads, simplifying file management and billing.
*   You can now [control the maximum number of tokens](/docs/assistants/overview) a run uses in the Assistants API, allowing you to manage token usage costs. You can also set limits on the number of previous / recent messages used in each run.
*   We've added support for the [`tool_choice` parameter](/docs/api-reference/runs/object#runs/object-tool_choice) which can be used to force the use of a specific tool (like `file_search`, `code_interpreter`, or a `function`) in a particular run.
*   You can now [create messages with the role `assistant`](/docs/api-reference/messages/createMessage#messages-createmessage-role) to create custom conversation histories in Threads.
*   Assistant and Run objects now support popular model configuration parameters like [`temperature`](/docs/api-reference/assistants/createAssistant#assistants-createassistant-temperature), [`response_format` (JSON mode)](/docs/api-reference/assistants/createAssistant#assistants-createassistant-response_format), and [`top_p`](/docs/api-reference/assistants/createAssistant#assistants-createassistant-top_p).
*   You can now use [fine-tuned models](/docs/guides/model-optimization) in the Assistants API. At the moment, only fine-tuned versions of `gpt-3.5-turbo-0125` are supported.
*   Assistants API now supports [streaming](/docs/assistants/overview#step-4-create-a-run?context=with-streaming).
*   We've added several streaming and polling helpers to our [Node](https://github.com/openai/openai-node/blob/master/helpers.md) and [Python](https://github.com/openai/openai-python/blob/main/helpers.md) SDKs.

See our [migration guide](/docs/assistants/migration) to learn more about how to migrate your tool usage to the latest version of the Assistants API.