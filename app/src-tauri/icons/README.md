# Tauri 应用图标

Tauri 打包需要以下图标文件，请在正式发布前将其替换为实际图标：

| 文件 | 尺寸 / 格式 | 用途 |
|------|------------|------|
| `32x32.png` | 32×32 PNG | Windows 任务栏 |
| `128x128.png` | 128×128 PNG | Linux 应用菜单 |
| `128x128@2x.png` | 256×256 PNG | macOS Retina |
| `icon.icns` | macOS ICNS | macOS 应用图标 |
| `icon.ico` | Windows ICO | Windows 安装程序 |

## 生成方法

准备好一张 **1024×1024** 的 PNG 源图（建议白色透明背景），然后运行：

```bash
# 在 app/ 目录下执行
npm run tauri icon path/to/your-icon-1024.png
```

Tauri CLI 会自动生成全部尺寸并放入此目录。

## 开发阶段临时使用

如果只是想在开发模式下跑通 `npm run dev`，可以先用项目已有的
`app/public/favicon.svg` 转换为 PNG 后使用。
