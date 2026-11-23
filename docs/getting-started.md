# Getting started

## Open Pixelbench

Start `Pixelbench.cmd`. Your browser opens at <http://127.0.0.1:3720>. The first start can take up to 90 seconds because a private ComfyUI process loads its nodes. The header shows when ComfyUI is connected.

The workspace has the tools below the canvas, the job settings on the right (the inspector) and the variants under the image. The five editing modes sit in the middle of the header: Create (1), Edit (2), Inpaint (3), Outpaint (4) and Extras (5).

## Create a first image

1. Choose **Create** (key **1**).
2. In the inspector pick a profile under **Workflow profile**, for example Krea 2 Turbo, Z-Image Turbo, Qwen-Image 2.1 or SDXL. Select the model files the profile asks for under **Models**. If a file is missing, the inspector says which one and where it is searched.
3. Type a prompt and press **Generate** or **Ctrl+Enter**.
4. The result appears as a variant under the canvas. Click it to preview it, then press **Apply** to make it the working image.

Applying a created image switches to **Edit**, unless you turn that off in Settings. If an image is already open, Pixelbench asks before replacing it, and **Ctrl+Z** brings it back.

## Edit an existing image

1. Open an image with **Ctrl+O**, drag it onto the canvas or use **Choose file**. PNG, JPEG and WebP are accepted.
2. Choose **Edit**, describe the change and generate.
3. To change only one area, choose **Inpaint**, paint a mask with the mask brush (**M**) and describe what should appear there.
4. To extend the picture, choose **Outpaint** and drag the frame handles.

## Export

Use the export button, **Ctrl+S** or **Shift+S**. The browser downloads the file with a new name. The file format, file name pattern and stored generation data are set in Settings under Export. If you close the tab with unexported changes, the browser warns you.

See [Editor and modes](editor.md) for every tool.
