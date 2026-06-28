#!/usr/bin/env bash
set -euo pipefail

# Bootstrap — installs dependencies, applies dotfiles via chezmoi
# The heavy lifting (packages, flatpak, scripts) is in .chezmoiscripts/

GITHUB_USER="emanuelet"

# Core deps for chezmoi
sudo apt update && sudo apt upgrade -y
sudo apt install -y zsh git curl wget

# chezmoi
if ! command -v chezmoi &>/dev/null; then
  sh -c "$(curl -fsLS get.chezmoi.io)" -- -b "$HOME/.local/bin"
fi

# Ensure ~/.local/bin is in PATH
export PATH="$HOME/.local/bin:$PATH"

# Apply dotfiles
chezmoi init --apply "$GITHUB_USER"

# opencode
if ! command -v opencode &>/dev/null; then
  curl -fsSL https://opencode.ai/install | bash
fi

# Set zsh as default shell
if [[ "$SHELL" != "$(which zsh)" ]]; then
  sudo chsh -s "$(which zsh)" "$(whoami)"
fi

echo "============================================"
echo " Bootstrap complete!"
echo " Packages and further setup run via chezmoi scripts"
echo " Next: op signin, then 'chezmoi apply --refresh-externals --force'"
echo "============================================"
