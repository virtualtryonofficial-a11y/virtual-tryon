# QUALITY_COMPARISON.md — FitRoom AI Try-On Quality Benchmark

This report documents the findings of **AGENT_TASK_022: FitRoom AI Quality Comparison Testing**. The goal of this experiment was to evaluate how different Shopify product image types impact the quality of the virtual try-on output when using the **FitRoom AI** provider.

---

## 🧪 Experiment Setup
*   **User Selfie:** Same front-facing photo of a model (`person.png`, compressed to `55KB`) with neutral lighting, plain background, and clear body proportions.
*   **AI Provider:** FitRoom AI (v2 Async Tasks API).
*   **Category:** `upper` (Upper-body try-on).
*   **Total Generations:** 5 (controlled, non-stress testing).

---

## 📊 Quality Comparison Matrix

| Test | Image Type | Quality Rating | Face Preservation | Shoulder & Sleeve Realism | Cloth Edge Quality | Texture Preservation | Distortions & Anatomy Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Isolated Garment** | 🟢 **Excellent** | Identical | Natural fit, thin straps aligned perfectly | Ultra-clean, sharp borders | High detail (buttons, red color) | None. Adapted midi dress into a camisole top naturally. |
| **2** | **Model-Worn** | 🟡 **Good** | Identical | Natural short sleeves, minor fold wrinkles | Good, soft blending on shoulders | Good solid green cotton | Minor wrinkling/exaggerated creases on sleeve folds. |
| **3** | **Flat Lay** | 🟠 **Fair** | Identical | Slightly boxy fit, stiff sleeve folds | Fair, underarm blurring | Good creamy white drape | Stiff folding patterns, slightly boxy torso proportions. |
| **4** | **Mannequin** | 🟡 **Good** | Identical | Good strap alignment over shoulders | Clean, sharp borders | Excellent canvas and leather details | Minor warping on the leather straps near collarbones. |
| **5** | **Lifestyle** | 🔴 **Poor** | Identical | Uneven shoulders, warped collar/neck | Poor, jagged edges, gray background bleeding | Fair, pattern stretched on chest | Warping at neck, jagged torso edges, gray wall bleed. |

---

## ⏱️ Performance & Latency Analytics

| Test | Phase / Image Type | Upload (R2) | Queue + Gen Time | Download Time | Total Duration | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Isolated Garment | 0.8s | 11.2s | 0.7s | **12.7s** | Completed |
| **2** | Model-Worn | 0.6s | 10.9s | 0.7s | **12.2s** | Completed |
| **3** | Flat Lay (Retry) | 0.7s | 10.6s | 0.7s | **12.0s** | Completed |
| **4** | Mannequin | 0.8s | 10.6s | 0.7s | **12.1s** | Completed |
| **5** | Lifestyle / Complex | 0.7s | 10.5s | 0.7s | **12.0s** | Completed |

> [!NOTE]
> *FitRoom task processing is highly consistent under low load, averaging **~10.7 seconds** for the AI generation cycle.*
> *The initial Flat Lay attempt failed due to a transient download timeout inside the provider client, but was successfully retried without wasting credits.*

---

## 🔍 Detailed Output Quality Analysis

### Test 1 — Isolated Garment (`1-isolated.jpg`)
*   **Face Preservation:** Perfect. The face, hair, and head position are identical to the input selfie.
*   **Shoulder & Sleeve Realism:** The thin straps rest naturally on the shoulders.
*   **Cloth Edge Quality:** Sharp and clean contrast against the model's skin and background.
*   **Texture Preservation:** Excellent. The lightweight cotton texture and the button line down the front are perfectly preserved.
*   **Distortions:** None. The AI adapted a tiered midi dress into an upper-body camisole top because the model wore denim jeans in the selfie.

### Test 2 — Model-Worn Image (`2-model-worn.jpg`)
*   **Face Preservation:** Perfect. No changes to face or neck.
*   **Shoulder & Sleeve Realism:** Good fit, though some exaggerated wrinkles appear near the shoulder folds.
*   **Cloth Edge Quality:** Soft blending at the shoulder lines, but looks natural.
*   **Texture Preservation:** Good solid color and knit fabric feel.
*   **Distortions:** Minor sleeve crease distortions.

### Test 3 — Flat Lay Image (`3-flat-lay.jpg`)
*   **Face Preservation:** Perfect.
*   **Shoulder & Sleeve Realism:** The shoulders appear slightly boxy and stiff, lacking the soft drape of a worn garment.
*   **Cloth Edge Quality:** Some fuzziness/blurring around the underarm area where the AI attempted to fold flat sleeves onto a 3D body.
*   **Texture Preservation:** Good cream white texture.
*   **Distortions:** Boxy torso and stiff folds.

### Test 4 — Mannequin Image (`4-mannequin.jpg`)
*   **Face Preservation:** Perfect.
*   **Shoulder & Sleeve Realism:** Straps are aligned well over the shoulders.
*   **Cloth Edge Quality:** Clean lines around the chest and armpits.
*   **Texture Preservation:** The canvas material and leather straps are rendered with high fidelity.
*   **Distortions:** Minor warping of the straps near the collarbone.

### Test 5 — Lifestyle / Complex Image (`5-lifestyle-complex.jpg`)
*   **Face Preservation:** Perfect.
*   **Shoulder & Sleeve Realism:** The collar is warped, and the shoulders look uneven and asymmetrical.
*   **Cloth Edge Quality:** Poor. Jagged edges and visible gray patches from the background wall bleed into the model's torso.
*   **Texture Preservation:** Stretched print/pattern over the chest.
*   **Distortions:** High warping and background bleeding.

---

## 🏆 Final Image Priority Ranking

Based on the experiment results, we confirm the following priority ranking for the **Smart Garment Image Selection System**:

1.  **Isolated Garment Image** (Clean transparent or white background) — *Best results, zero bleeding.*
2.  **Mannequin / Ghost Mannequin** — *Stable alignment, minimal distortion.*
3.  **Model-Worn (Clean front shot)** — *Good realism, minor folding/crease artifacts.*
4.  **Flat Lay** — *Fair fit, boxy shoulders.*
5.  **Lifestyle / Complex Image** — *Worst case, background bleeding and edge artifacts.*

---

## 💡 Merchant Upload Recommendations & Best Practices

To ensure merchants get the absolute best virtual try-on quality, we recommend publishing the following guidelines in their dashboard:

1.  **Always Upload an Isolated Product Shot:** Ensure each product listing has at least one image of the garment isolated on a pure white (#FFFFFF) or transparent background.
2.  **Use Ghost Mannequins over Hangers:** If isolated shots aren't available, front-facing ghost mannequin images are highly preferred over clothes hanging on a wire/wooden hanger.
3.  **Avoid Cluttered Lifestyle Backgrounds:** Images with street backgrounds, trees, or complex outdoor lighting bleed into the try-on output.
4.  **Avoid Flat Lays for Fitted Tops:** Tops laid flat on tables tend to generate boxy, stiff shoulders.
5.  **Avoid Angled Poses:** Ensure the model or mannequin in the product image is facing directly forward.

---

## 🛠️ Suggestions for Smart Garment Selection Enhancements
*   **Penalize Non-Front Alt Texts:** Check alt texts for words like `detail`, `side`, `back`, or `angled` and apply a `-30` penalty.
*   **Hanger Detection:** Apply a `-25` penalty to files or alt texts containing `hanger` as they create boxy and uneven shoulder lines.
*   **Contrast / Plain Background Check:** In future AI models, use a simple lightweight edge-detection or background color heuristic on the shopify image URL to verify plain white backgrounds.
