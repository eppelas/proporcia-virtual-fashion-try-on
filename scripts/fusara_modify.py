import argparse
import json
import os
import sys
import time
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://api.fusara.ai"
GENERATE_URL = f"{BASE_URL}/api/integration/imaging/generate"
TASKS_URL = f"{BASE_URL}/api/integration/imaging/tasks"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, ".fusara_modify_config.json")

MODELS = {
    "qwen": {
        "__type": 21,
        "name": "Qwen Image",
        "defaults": {
            "Width": 1024,
            "Height": 1024,
            "NumberOfInferenceSteps": 50,
            "GuidanceScale": 4.0,
        },
    },
    "seedream": {
        "__type": 22,
        "name": "Seedream 4.0",
        "defaults": {
            "Size": "1024x1024",
            "GuidanceScale": 2.5,
        },
    },
}

PRESET_TYPES = {
    "image_ref": {"__type": 1, "label": "Base Image (обязательный image_ref)"},
    "style_ref": {"__type": 2, "label": "Style Reference"},
    "char_ref": {"__type": 3, "label": "Character Reference"},
    "contour_ref": {"__type": 8, "label": "Contour Reference"},
    "depth_ref": {"__type": 9, "label": "Depth Reference"},
    "composition_ref": {"__type": 10, "label": "Composition Reference"},
}


def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_config(cfg):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def get_api_key(cli_key=None):
    if cli_key:
        return cli_key.strip()

    env_key = os.getenv("FUSARA_API_KEY", "").strip()
    if env_key:
        return env_key

    cfg = load_config()
    if cfg.get("api_key"):
        return cfg["api_key"].strip()

    key = input("Fusara API key: ").strip()
    if not key:
        print("API key required.")
        sys.exit(1)
    cfg["api_key"] = key
    save_config(cfg)
    print("  Saved API key to .fusara_modify_config.json\n")
    return key


def hdrs(api_key):
    return {"X-API-Key": api_key, "Content-Type": "application/json"}


def ask_multiline_prompts():
    print("Paste prompts (each paragraph = one prompt).")
    print("Finish with two empty lines:\n")
    lines, empties = [], 0
    while True:
        try:
            line = input()
        except EOFError:
            break
        if not line.strip():
            empties += 1
            lines.append("")
            if empties >= 2:
                break
        else:
            empties = 0
            lines.append(line)

    prompts, cur = [], []
    for ln in lines:
        if ln.strip():
            cur.append(ln.strip())
        elif cur:
            prompts.append(" ".join(cur))
            cur = []
    if cur:
        prompts.append(" ".join(cur))
    return prompts


def parse_weight(raw, default=80):
    if raw.isdigit() and 0 <= int(raw) <= 100:
        return int(raw)
    return default


def ask_presets_interactive(base_image_url=None):
    presets = []

    image_url = base_image_url or input("Base image URL (обязательно для modify): ").strip()
    if not image_url:
        print("Base image URL is required for modify mode.")
        sys.exit(1)

    w = input("Base image weight 0-100 [100]: ").strip()
    presets.append({"__type": PRESET_TYPES["image_ref"]["__type"], "Weight": parse_weight(w, 100), "ExternalUrl": image_url})

    print("\nOptional references (Enter to skip):")
    for key in ["style_ref", "char_ref", "contour_ref", "depth_ref", "composition_ref"]:
        label = PRESET_TYPES[key]["label"]
        url = input(f"  {label} URL: ").strip()
        if not url:
            continue
        wt = input(f"  {label} weight 0-100 [80]: ").strip()
        presets.append({"__type": PRESET_TYPES[key]["__type"], "Weight": parse_weight(wt, 80), "ExternalUrl": url})

    return presets


def build_presets_from_args(base_image, style_refs, char_refs, contour_refs, depth_refs, composition_refs):
    presets = []
    if not base_image:
        return presets

    presets.append({"__type": PRESET_TYPES["image_ref"]["__type"], "Weight": 100, "ExternalUrl": base_image})

    for url in style_refs:
        presets.append({"__type": PRESET_TYPES["style_ref"]["__type"], "Weight": 80, "ExternalUrl": url})
    for url in char_refs:
        presets.append({"__type": PRESET_TYPES["char_ref"]["__type"], "Weight": 80, "ExternalUrl": url})
    for url in contour_refs:
        presets.append({"__type": PRESET_TYPES["contour_ref"]["__type"], "Weight": 80, "ExternalUrl": url})
    for url in depth_refs:
        presets.append({"__type": PRESET_TYPES["depth_ref"]["__type"], "Weight": 80, "ExternalUrl": url})
    for url in composition_refs:
        presets.append({"__type": PRESET_TYPES["composition_ref"]["__type"], "Weight": 80, "ExternalUrl": url})

    return presets


def submit_modify(prompt, model_key, num_images, presets, headers):
    model = MODELS[model_key]
    body = {
        "__type": model["__type"],
        "Prompt": prompt,
        "NumberOfImages": num_images,
        "TaskPresets": presets,
    }
    body.update(model["defaults"])

    r = requests.post(GENERATE_URL, json=body, headers=headers, verify=False)
    if r.status_code == 200:
        task_id = r.json().get("data", {}).get("taskId")
        print(f"  Task {task_id} submitted ({model['name']}, modify)")
        return task_id

    print(f"  Submit error: {r.status_code} - {r.text[:300]}")
    return None


def wait_for_task(task_id, headers, poll=5, timeout=300):
    elapsed = 0
    while elapsed < timeout:
        r = requests.get(f"{TASKS_URL}/{task_id}/status", headers=headers, verify=False)
        if r.status_code != 200:
            print(f"\n  Status error: {r.status_code}")
            return False

        status = r.json().get("data")
        m, s = divmod(elapsed, 60)
        print(f"\r  {m}m{s:02d}s ...", end="", flush=True)

        if status == 100:
            print()
            return True
        if status and status >= 400:
            print(f"\n  Failed ({status})")
            return False

        time.sleep(poll)
        elapsed += poll

    print("\n  Timeout")
    return False


def download_images(task_id, out_dir, headers, prefix):
    r = requests.get(f"{TASKS_URL}/{task_id}", headers=headers, verify=False)
    if r.status_code != 200:
        print(f"  Download metadata error: {r.status_code}")
        return []

    images = r.json().get("data", {}).get("images", [])
    saved = []
    for i, img in enumerate(images, start=1):
        url = img.get("url")
        if not url:
            continue
        data = requests.get(url, verify=False).content
        fp = os.path.join(out_dir, f"{prefix}_{task_id}_{i}.png")
        with open(fp, "wb") as f:
            f.write(data)
        saved.append(fp)
        print(f"  Saved: {fp}")
    return saved


def main():
    parser = argparse.ArgumentParser(description="Fusara MODIFY generator for Qwen/Seedream")
    parser.add_argument("--model", choices=["qwen", "seedream"], default="qwen", help="Model key")
    parser.add_argument("--api-key", help="Fusara API key (or use FUSARA_API_KEY env)")
    parser.add_argument("--prompt", action="append", help="Prompt (can be repeated)")
    parser.add_argument("--base-image", help="Base image URL (required in non-interactive mode)")
    parser.add_argument("--style-ref", action="append", default=[], help="Style ref URL")
    parser.add_argument("--char-ref", action="append", default=[], help="Character ref URL")
    parser.add_argument("--contour-ref", action="append", default=[], help="Contour ref URL")
    parser.add_argument("--depth-ref", action="append", default=[], help="Depth ref URL")
    parser.add_argument("--composition-ref", action="append", default=[], help="Composition ref URL")
    parser.add_argument("--num", type=int, default=1, help="Images per prompt [1..4]")
    parser.add_argument("--out", default=os.path.join(os.path.expanduser("~"), "Desktop", "fusara_output"), help="Output directory")
    args = parser.parse_args()

    num_images = min(max(args.num, 1), 4)
    os.makedirs(args.out, exist_ok=True)

    print("=" * 56)
    print("  FUSARA MODIFY GENERATOR (NO EDIT)")
    print("=" * 56)
    print(f"Model: {MODELS[args.model]['name']}")
    print(f"Endpoint: {GENERATE_URL}\n")

    api_key = get_api_key(args.api_key)
    headers = hdrs(api_key)

    prompts = [p.strip() for p in (args.prompt or []) if p and p.strip()]
    if not prompts:
        prompts = ask_multiline_prompts()
    if not prompts:
        print("No prompts.")
        return

    presets = build_presets_from_args(
        args.base_image,
        args.style_ref,
        args.char_ref,
        args.contour_ref,
        args.depth_ref,
        args.composition_ref,
    )

    if not presets:
        presets = ask_presets_interactive(base_image_url=args.base_image)

    if not any(p.get("__type") == PRESET_TYPES["image_ref"]["__type"] for p in presets):
        print("Modify mode requires at least one image_ref (base image URL).")
        return

    print(f"\nPrompts: {len(prompts)}")
    print(f"References: {len(presets)}")
    if input("Run modify? [Y/n]: ").strip().lower() == "n":
        return

    all_saved = []
    print(f"\n{'=' * 56}\n")
    for i, prompt in enumerate(prompts, start=1):
        print(f"[{i}/{len(prompts)}] {prompt[:80]}{'...' if len(prompt) > 80 else ''}")
        task_id = submit_modify(prompt, args.model, num_images, presets, headers)
        if task_id and wait_for_task(task_id, headers):
            all_saved += download_images(task_id, args.out, headers, f"modify{i}")
        print()

    print("=" * 56)
    print(f"Done! {len(all_saved)} images in {args.out}")


if __name__ == "__main__":
    main()
