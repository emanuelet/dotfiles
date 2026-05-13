#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Bootstrap script for Emanuele's workstation
# Generated from Pop!_OS 24.04 — adapt for new Ubuntu version
# ============================================================

GITHUB_USER="emanuelet"

# ── 1. System packages & repos ──────────────────────────────
sudo apt update && sudo apt upgrade -y

# Add third-party repo keys and sources
# 1Password
sudo install -d /usr/share/keyrings
curl -fsSL https://downloads.1password.com/linux/keys/1password-archive-keyring.gpg \
  | sudo tee /usr/share/keyrings/1password-archive-keyring.gpg >/dev/null
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/amd64 stable main" \
  | sudo tee /etc/apt/sources.list.d/1password.list

# GitHub CLI
sudo install -d /etc/apt/keyrings
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | sudo tee /etc/apt/sources.list.d/github-cli.list

# Google Cloud SDK
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
  | sudo tee /usr/share/keyrings/cloud.google.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
  | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list

# VS Code
curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
  | sudo tee /usr/share/keyrings/microsoft.gpg >/dev/null
sudo tee /etc/apt/sources.list.d/vscode.sources >/dev/null <<'VSCEOF'
Types: deb
URIs: https://packages.microsoft.com/repos/code
Suites: stable
Components: main
Architectures: amd64
Signed-By: /usr/share/keyrings/microsoft.gpg
VSCEOF

# Windsurf
curl -fsSL https://windsurf-stable.codeiumdata.com/wVxQEIWkwPUEAGf3/apt/keyring.gpg \
  | sudo tee /etc/apt/keyrings/windsurf-stable.gpg >/dev/null
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/windsurf-stable.gpg] https://windsurf-stable.codeiumdata.com/wVxQEIWkwPUEAGf3/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/windsurf.list

# Slack
echo "deb https://packagecloud.io/slacktechnologies/slack/debian/ jessie main" \
  | sudo tee /etc/apt/sources.list.d/slack.list

# Docker Engine
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list

sudo apt update

# Core CLI tools
sudo apt install -y \
  zsh \
  vim \
  git \
  gh \
  curl \
  wget \
  build-essential \
  gfortran \
  libblas-dev \
  liblapack-dev \
  apt-transport-https \
  solaar \
  xclip \
  xdotool \
  libnotify-bin \
  vlc \
  ffmpeg \
  synaptic \
  alsa-utils \
  meld \
  docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Switch to zsh immediately so subsequent steps rely on it
sudo chsh -s "$(which zsh)" "$(whoami)"

# External .deb packages (manual download might be needed for new Ubuntu)
# Uncomment and adjust URLs as needed:
sudo apt install -y code        # or apt install code from MS repo
sudo apt install -y 1password            # from 1password repo
sudo apt install -y slack-desktop        # from slack repo
sudo apt install -y windsurf             # from windsurf repo
sudo apt install -y google-cloud-cli     # from gcloud repo
# libreoffice is pre-installed on Ubuntu

# ── 2. Flatpak ──────────────────────────────────────────────
# Install flatpak if not present (Ubuntu includes it)
sudo apt install -y flatpak
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo

flatpak install -y flathub \
  com.brave.Browser \
  com.spotify.Client \
  com.stremio.Stremio \
  org.telegram.desktop \
  org.gimp.GIMP \
  com.rtosta.zapzap

# ── 3. chezmoi (dotfiles) ────────────────────────────────────
if ! command -v chezmoi &>/dev/null; then
  sudo apt install -y chezmoi || sh -c "$(curl -fsLS git.io/chezmoi)" -- init --apply "$GITHUB_USER"
fi

# After initial setup, run:
#   chezmoi init --apply $GITHUB_USER
# (this will deploy your .zshrc and other managed dotfiles)

# ── 4. mise (runtime version manager) ────────────────────────
if ! command -v mise &>/dev/null; then
  curl https://mise.run | sh
fi
eval "$(~/.local/bin/mise activate bash)"

# Install runtimes defined in ~/.config/mise/config.toml
mise install
mise use -g node@lts
mise use -g python@latest
mise use -g pnpm@latest
mise use -g uv@latest

# ── 5. pnpm global packages ──────────────────────────────────
pnpm add -g \
  npm-check-updates \
  tsx

# ── 6. Zsh + plugins ────────────────────────────────────────

# zinit will auto-install on first shell launch (configured in .zshrc)
# The following plugins are loaded by .zshrc:
#   - zdharma-continuum/zinit
#   - zsh-users/zsh-autosuggestions
#   - zsh-users/zsh-syntax-highlighting
#   - marlonrichert/zsh-autocomplete
# Plus zinit annexes:
#   - zinit-annex-as-monitor
#   - zinit-annex-bin-gem-node
#   - zinit-annex-patch-dl
#   - zinit-annex-rust

# Manual zinit + plugin install (alternative if .zshrc hasn't been applied yet):
# ZINIT_HOME="${ZDOTDIR:-$HOME}/.local/share/zinit/zinit.git"
# if [[ ! -d "$ZINIT_HOME" ]]; then
#   mkdir -p "$(dirname "$ZINIT_HOME")"
#   git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
# fi

# Starship prompt
if ! command -v starship &>/dev/null; then
  curl -fsSL https://starship.rs/install.sh | sh -s -- -y
fi
# Config is at ~/.config/starship.toml (managed by chezmoi if added)

# ── 7. NVIDIA / CUDA (if on NVIDIA hardware) ─────────────────
sudo apt install cuda-toolkit -y

# ── 8. Python (via uv) ───────────────────────────────────────
uv tool install poetry

# ── 9. Git config ────────────────────────────────────────────
git config --global user.name "Emanuele Tonello"
git config --global user.email "emanueletonello@gmail.com"
git config --global pull.rebase true

# ── 10. Config files to restore manually ──────────────────────
# The following files are NOT managed by chezmoi — back them up:
#   ~/.ssh/id_ed25519*          (SSH keys)
#   ~/.gitconfig                (already set above)
#   ~/.config/starship.toml     (zsh prompt config)
#   ~/.config/mise/config.toml  (runtime versions)
#   ~/.config/autostart/        (startup apps)
#   ~/.config/gtk-3.0/          (GTK settings)
#   ~/.config/gtk-4.0/
#   ~/.config/Code/             (VS Code settings)
#   ~/.config/Windsurf/         (Windsurf settings)
#   ~/.config/google-chrome/    (Chrome profile — usually too large)

echo "============================================"
echo " Bootstrap complete!"
echo " Next steps:"
echo "   1. Reboot to apply NVIDIA drivers"
echo "   2. Open a new terminal for zsh + zinit"
echo "   3. Run: chezmoi init --apply $GITHUB_USER"
echo "============================================"
