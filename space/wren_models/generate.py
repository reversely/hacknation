"""The json and chat calls (docs/space.md, Model calls). Qwen2.5-Coder writes website copy as JSON;
Gemma 4 E2B answers visitor questions and labels review sentiment. Both use greedy decoding, so a
repeated input returns the cached result without reaching the GPU function.

The JSON schema travels in the prompt as an instruction; the caller validates the result and retries
(app/src/survey/pipeline.ts), so no constrained-decoding library is needed for now."""

import json
import re
import time

import spaces
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from . import cache
from .config import MODELS
from .weights import local_path


def _load(role: str):
    spec = MODELS[role]
    path = local_path(role)
    tokenizer = AutoTokenizer.from_pretrained(path)
    model = AutoModelForCausalLM.from_pretrained(path, torch_dtype=getattr(torch, spec["dtype"])).to("cuda").eval()
    return spec, tokenizer, model


# Placed on the GPU when the module loads, as ZeroGPU requires.
_CODER = _load("website_copy")
_AGENT = _load("agent")


def _run(loaded, messages: list[dict], max_tokens: int) -> str:
    spec, tokenizer, model = loaded
    inputs = tokenizer.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt", return_dict=True).to("cuda")
    settings = {**spec["generation"], "max_new_tokens": min(max_tokens, spec["generation"]["max_new_tokens"])}
    with torch.inference_mode():
        out = model.generate(**inputs, **settings)
    return tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()


@spaces.GPU(duration=MODELS["website_copy"]["gpu_seconds"])
def _coder(messages: list[dict], max_tokens: int) -> str:
    return _run(_CODER, messages, max_tokens)


@spaces.GPU(duration=MODELS["agent"]["gpu_seconds"])
def _agent(messages: list[dict], max_tokens: int) -> str:
    return _run(_AGENT, messages, max_tokens)


def _first_json_object(text: str) -> str:
    match = re.search(r"\{.*\}", text, re.S)
    return match.group(0) if match else text


def json_generate(prompt: str, schema: dict, max_tokens: int) -> dict:
    spec = _CODER[0]
    started = time.time()
    messages = [{"role": "user", "content": f"{prompt}\n\nReply with one JSON object only, matching this JSON schema:\n{json.dumps(schema)}"}]
    k = cache.key("json", spec["revision"], spec["generation"], {"messages": messages, "max_tokens": max_tokens})
    hit = cache.get(k)
    text = hit if hit is not None else _first_json_object(_coder(messages, max_tokens))
    if hit is None:
        cache.put(k, text)
    return {"text": text, "model": spec["repo"], "revision": spec["revision"], "ms": int((time.time() - started) * 1000), "cached": hit is not None}


def chat(messages: list[dict], max_tokens: int) -> dict:
    spec = _AGENT[0]
    started = time.time()
    k = cache.key("chat", spec["revision"], spec["generation"], {"messages": messages, "max_tokens": max_tokens})
    hit = cache.get(k)
    text = hit if hit is not None else _agent(messages, max_tokens)
    if hit is None:
        cache.put(k, text)
    return {"text": text, "model": spec["repo"], "revision": spec["revision"], "ms": int((time.time() - started) * 1000), "cached": hit is not None}
