"""Wren demonstration Space (docs/space.md). Gradio serves the TypeScript bundle, which renders the
phone panel and the narration panel; `translate` is the first model call (docs/space.md, Model calls)."""

import time
from pathlib import Path

import gradio as gr
import spaces
import torch

from wren_models.generate import chat, json_generate, visitor
from wren_models.translate import translate

WEB = Path(__file__).parent / "web" / "dist"
gr.set_static_paths(paths=[WEB])
# The bundle's file name carries a content hash; manifest.json names the current one.
BUNDLE = (WEB / "manifest.json").read_text().strip()
# Gradio's own page padding and footer would box in the bundle's full-page layout.
PAGE_CSS = "footer{display:none!important} .gradio-container, .gradio-container .fillable, main.fillable, .app{max-width:100%!important;width:100%!important;padding:0!important;margin:0!important} .gradio-container .main, .gradio-container .wrap, .gradio-container .contain{padding:0!important;gap:0!important} #wren-host{padding:0!important}"


@spaces.GPU(duration=15)
def ping_gpu(text: str) -> dict:
    started = time.time()
    device = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "no GPU"
    total = float(torch.ones(1024, device="cuda" if torch.cuda.is_available() else "cpu").sum())
    return {"echo": text, "device": device, "sum": total, "ms": int((time.time() - started) * 1000)}


with gr.Blocks(head=f'<script type="module" src="/gradio_api/file={WEB / BUNDLE}"></script>', css=PAGE_CSS, fill_width=True) as demo:
    gr.HTML('<div id="wren-root"></div>', elem_id="wren-host", padding=False)
    gr.api(ping_gpu, api_name="ping_gpu")
    gr.api(translate, api_name="translate")
    gr.api(json_generate, api_name="json")
    gr.api(chat, api_name="chat")
    gr.api(visitor, api_name="visitor")

demo.launch()
