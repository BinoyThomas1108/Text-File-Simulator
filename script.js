const initialContent = `Welcome to Python
Computer Science
Class XII
File Handling
Let's learn!`;

const modeInfo = {
  "r": "Open for reading. The file must already exist.",
  "r+": "Open for reading and writing. The file must already exist.",
  "w": "Open for writing. Creates a new file or overwrites an existing file.",
  "w+": "Open for reading and writing. Creates a new file or overwrites an existing file.",
  "a": "Open for appending. Creates a new file if it does not exist.",
  "a+": "Open for reading and appending. Creates a new file if it does not exist.",
  "x": "Create a new file. Fails if the file already exists.",
  "x+": "Create a new file for reading and writing. Fails if the file already exists."
};

let state = {
  content: initialContent,
  pointer: 0,
  mode: "r",
  opened: false,
  exists: true
};

let pyodide = null;
let pyodideLoading = null;

const fileEditor = document.getElementById("fileEditor");
const fileSize = document.getElementById("fileSize");
const lineCount = document.getElementById("lineCount");
const tellValue = document.getElementById("tellValue");
const pointerPosition = document.getElementById("pointerPosition");
const pointerView = document.getElementById("pointerView");
const output = document.getElementById("output");
const statusText = document.getElementById("statusText");
const modeSelect = document.getElementById("modeSelect");
const modeDescription = document.getElementById("modeDescription");
const commandText = document.getElementById("commandText");
const executeBtn = document.getElementById("executeBtn");

function render() {
  fileEditor.textContent = state.content;
  fileSize.textContent = state.content.length;
  lineCount.textContent = state.content.length === 0 ? 0 : state.content.split("\n").length;
  tellValue.textContent = state.pointer;
  pointerPosition.textContent = state.pointer;
  modeSelect.value = state.mode;
  modeDescription.textContent = `${state.mode} — ${modeInfo[state.mode]}`;
  renderPointer();
}

function renderPointer() {
  pointerView.innerHTML = "";

  if (state.content.length === 0) {
    pointerView.innerHTML = '<span class="char-cell">∅</span>';
    return;
  }

  [...state.content].forEach((char, index) => {
    const cell = document.createElement("div");
    cell.className = "char-cell";

    if (index === state.pointer) cell.classList.add("pointer");

    if (char === "\n") {
      cell.classList.add("newline");
      cell.textContent = "\\n";
    } else if (char === " ") {
      cell.textContent = "·";
    } else {
      cell.textContent = char;
    }

    const indexLabel = document.createElement("span");
    indexLabel.className = "index";
    indexLabel.textContent = index;
    cell.appendChild(indexLabel);
    pointerView.appendChild(cell);
  });

  if (state.pointer === state.content.length) {
    const endCell = document.createElement("div");
    endCell.className = "char-cell pointer";
    endCell.textContent = "EOF";
    pointerView.appendChild(endCell);
  }
}

function setOutput(text) {
  output.textContent = text;
}

function setStatus(text) {
  statusText.textContent = text;
}

function ask(title, message, defaultValue = "") {
  return new Promise(resolve => {
    const modal = document.getElementById("modal");
    const modalTitle = document.getElementById("modalTitle");
    const modalMessage = document.getElementById("modalMessage");
    const modalInput = document.getElementById("modalInput");
    const ok = document.getElementById("modalOk");
    const cancel = document.getElementById("modalCancel");

    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalInput.value = defaultValue;
    modal.classList.remove("hidden");
    modalInput.focus();

    function finish(value) {
      modal.classList.add("hidden");
      ok.onclick = null;
      cancel.onclick = null;
      modalInput.onkeydown = null;
      resolve(value);
    }

    ok.onclick = () => finish(modalInput.value);
    cancel.onclick = () => finish(null);
    modalInput.onkeydown = e => {
      if (e.key === "Enter") finish(modalInput.value);
      if (e.key === "Escape") finish(null);
    };
  });
}

async function ensurePyodide() {
  if (pyodide) return pyodide;
  if (!pyodideLoading) {
    setStatus("Loading Python runtime... Please wait.");
    pyodideLoading = loadPyodide().then(runtime => {
      pyodide = runtime;
      return runtime;
    });
  }
  return pyodideLoading;
}

function writeVirtualFile(runtime) {
  const bytes = new TextEncoder().encode(state.content);
  try {
    runtime.FS.writeFile("/data.txt", bytes);
  } catch {
    runtime.FS.mkdirTree("/");
    runtime.FS.writeFile("/data.txt", bytes);
  }
}

function readVirtualFile(runtime) {
  try {
    const bytes = runtime.FS.readFile("/data.txt");
    return new TextDecoder().decode(bytes);
  } catch {
    return state.content;
  }
}

function normalizeCommandSource(source) {
  return source
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .trim();
}

function fromPyValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value.toJs === "function") return value.toJs();
  return value;
}

async function executePython() {
  const source = normalizeCommandSource(commandText.innerText || commandText.textContent || "");
  if (!source) return;

  executeBtn.disabled = true;
  executeBtn.textContent = "⏳ Running...";

  try {
    const runtime = await ensurePyodide();
    writeVirtualFile(runtime);

    runtime.globals.set("__sim_initial_content", state.content);
    runtime.globals.set("__sim_mode", state.mode);

    const wrapper = `
import builtins
import io
import contextlib

sim_open_files = []
__sim_real_open = builtins.open

class __SimFile:
  def __init__(self, file):
    self._file = file
    self._last_position = 0
    sim_open_files.append(self)
  def __enter__(self):
    self._file.__enter__()
    self._last_position = self._file.tell()
    return self
  def __exit__(self, exc_type, exc_value, traceback):
    try:
      self._last_position = self._file.tell()
    except Exception:
      pass
    return self._file.__exit__(exc_type, exc_value, traceback)
  def __iter__(self):
    return self
  def __next__(self):
    value = next(self._file)
    try:
      self._last_position = self._file.tell()
    except Exception:
      pass
    return value
  def read(self, *args, **kwargs):
    value = self._file.read(*args, **kwargs)
    self._last_position = self._file.tell()
    return value
  def readline(self, *args, **kwargs):
    value = self._file.readline(*args, **kwargs)
    self._last_position = self._file.tell()
    return value
  def readlines(self, *args, **kwargs):
    value = self._file.readlines(*args, **kwargs)
    self._last_position = self._file.tell()
    return value
  def write(self, *args, **kwargs):
    value = self._file.write(*args, **kwargs)
    self._last_position = self._file.tell()
    return value
  def writelines(self, *args, **kwargs):
    value = self._file.writelines(*args, **kwargs)
    self._last_position = self._file.tell()
    return value
  def seek(self, *args, **kwargs):
    value = self._file.seek(*args, **kwargs)
    self._last_position = self._file.tell()
    return value
  def tell(self):
    self._last_position = self._file.tell()
    return self._last_position
  def close(self):
    try:
      self._last_position = self._file.tell()
    except Exception:
      pass
    return self._file.close()
  def __getattr__(self, name):
    return getattr(self._file, name)
  def __repr__(self):
    return repr(self._file)

def __sim_open(file, mode='r', *args, **kwargs):
  target = str(file)
  if target == 'data.txt':
    target = '/data.txt'
  return __SimFile(__sim_real_open(target, mode, *args, **kwargs))

builtins.open = __sim_open

__sim_stdout = io.StringIO()
__sim_stderr = io.StringIO()
__sim_result = None
try:
  with contextlib.redirect_stdout(__sim_stdout), contextlib.redirect_stderr(__sim_stderr):
    exec(compile(__sim_source, '<student>', 'exec'), globals(), globals())
except Exception as __sim_error:
  __sim_result = __sim_error
finally:
  builtins.open = __sim_real_open

__sim_output = __sim_stdout.getvalue()
__sim_errors = __sim_stderr.getvalue()
__sim_pointer = None
__sim_closed = None
if sim_open_files:
  for __sim_file in reversed(sim_open_files):
    try:
      if __sim_file.closed:
        __sim_pointer = __sim_file._last_position
        __sim_closed = True
      else:
        __sim_pointer = __sim_file.tell()
        __sim_closed = False
      break
    except Exception:
      pass
`;

    runtime.globals.set("__sim_source", source);
    await runtime.runPythonAsync(wrapper);

    const pyOutput = fromPyValue(runtime.globals.get("__sim_output"));
    const pyErrors = fromPyValue(runtime.globals.get("__sim_errors"));
    const pyResult = runtime.globals.get("__sim_result");
    const pyPointer = fromPyValue(runtime.globals.get("__sim_pointer"));
    const pyClosed = fromPyValue(runtime.globals.get("__sim_closed"));

    state.content = readVirtualFile(runtime);
    state.exists = true;

    if (pyPointer !== undefined && pyPointer !== null && pyPointer !== "None") {
      state.pointer = Number(pyPointer);
    } else {
      state.pointer = 0;
    }

    if (pyClosed !== undefined && pyClosed !== null && pyClosed !== "None") {
      state.opened = !Boolean(pyClosed);
    } else {
      state.opened = false;
    }

    let result = "";
    if (pyOutput) result += pyOutput;
    if (pyErrors) result += (result ? "\n" : "") + pyErrors;

    if (pyResult && pyResult !== null && pyResult !== undefined) {
      const errorText = pyResult.toString();
      if (errorText && errorText !== "None") {
        result += (result ? "\n" : "") + errorText;
      }
      if (typeof pyResult.destroy === "function") pyResult.destroy();
    }

    if (!result) result = "Execution completed successfully.";
    setOutput(result.trimEnd());
    setStatus("Python code executed using the Pyodide Python runtime.");
    render();
  } catch (error) {
    setOutput(String(error));
    setStatus("The Python code could not be executed.");
  } finally {
    executeBtn.disabled = false;
    executeBtn.textContent = "▶ Execute";
  }
}

document.querySelectorAll("[data-op]").forEach(button => {
  button.addEventListener("click", async () => {
    const op = button.dataset.op;
    const runtime = await ensurePyodide();
    writeVirtualFile(runtime);

    if (op === "read") {
      commandText.textContent = 'f = open("data.txt", "r")\ns = f.read()\nprint(s)';
      await executePython();
    }
    if (op === "readline") {
      commandText.textContent = 'f = open("data.txt", "r")\nprint(f.readline())';
      await executePython();
    }
    if (op === "readlines") {
      commandText.textContent = 'f = open("data.txt", "r")\nL = f.readlines()\nprint(L)';
      await executePython();
    }
    if (op === "write") {
      const text = await ask("write(text)", "Enter the text to write:", "Hello from Python");
      if (text === null) return;
      commandText.textContent = `f = open("data.txt", "${state.mode}")\nf.write(${JSON.stringify(text)})`;
      await executePython();
    }
    if (op === "writelines") {
      const text = await ask("writelines(list)", "Enter lines separated with | . Example: Red|Green|Blue", "Red|Green|Blue");
      if (text === null) return;
      const lines = text.split("|");
      commandText.textContent = `f = open("data.txt", "${state.mode}")\nf.writelines(${JSON.stringify(lines)})`;
      await executePython();
    }
    if (op === "append") {
      const text = await ask("append", "Enter text to append at the end:", "New line added");
      if (text === null) return;
      commandText.textContent = `f = open("data.txt", "a")\nf.write(${JSON.stringify(text)})`;
      await executePython();
    }
    if (op === "seek") {
      const pos = await ask("seek(pos)", `Enter a position from 0 to ${state.content.length}:`, String(state.pointer));
      if (pos === null) return;
      commandText.textContent = `f = open("data.txt", "${state.mode}")\nf.seek(${Number(pos)})\nprint(f.tell())`;
      await executePython();
    }
    if (op === "tell") {
      commandText.textContent = 'f = open("data.txt", "r")\nprint(f.tell())';
      await executePython();
    }
    if (op === "close") {
      commandText.textContent = 'f = open("data.txt", "r")\nf.close()\nprint(f.closed)';
      await executePython();
    }
  });
});

modeSelect.addEventListener("change", () => {
  state.mode = modeSelect.value;
  const current = (commandText.innerText || "").trim();
  if (!current || /^f = open\("data\.txt",\s*"[^"]+"\)\s*$/.test(current)) {
    commandText.textContent = `f = open("data.txt", "${state.mode}")`;
  }
  modeDescription.textContent = `${state.mode} — ${modeInfo[state.mode]}`;
  setStatus(`Selected mode ${state.mode}. Click Execute to run the Python code.`);
});

executeBtn.addEventListener("click", executePython);

commandText.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    executePython();
  }
});

document.getElementById("resetBtn").addEventListener("click", () => {
  state = {
    content: initialContent,
    pointer: 0,
    mode: "r",
    opened: false,
    exists: true
  };
  commandText.textContent = 'f = open("data.txt", "r")';
  setOutput("Simulator reset.\nSelect a mode and execute open().");
  setStatus("The file is ready. Select a mode and execute open().");
  render();
});

document.getElementById("editFileBtn").addEventListener("click", async () => {
  const text = await ask(
    "Edit data.txt",
    "Enter the complete file contents. Use \\n for line breaks.",
    state.content.replaceAll("\n", "\\n")
  );

  if (text === null) return;

  state.content = text.replaceAll("\\n", "\n");
  state.pointer = Math.min(state.pointer, state.content.length);
  state.exists = true;
  setOutput("data.txt contents updated.");
  setStatus("The file contents have been edited for the simulation.");
  render();
});

render();
setOutput("Simulator ready.\nSelect a mode and execute open().");
ensurePyodide().then(() => {
  setStatus("Python runtime ready. Enter Python code and click Execute.");
}).catch(() => {
  setStatus("Python runtime could not be loaded. Check your internet connection.");
});
