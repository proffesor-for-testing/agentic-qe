#!/bin/bash

# Configure Git safe directories first (Fix for Issue #10)
echo "🔧 Configuring Git safe directories..."
git config --global --add safe.directory '*' 2>/dev/null || true
git config --global --add safe.directory /workspaces 2>/dev/null || true
git config --global --add safe.directory /workspaces/* 2>/dev/null || true
git config --global --add safe.directory /workspace 2>/dev/null || true
echo "✅ Git safe directories configured"

# Initialize report file
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPORT_FILE="$SCRIPT_DIR/installation-report.md"
echo "# 📦 DevContainer Installation Report" > "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**Generated on:** $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## 📊 Installation Summary" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Track installation results
declare -A INSTALL_STATUS
declare -A INSTALL_NOTES

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to record installation status
record_status() {
    local tool="$1"
    local status="$2"
    local note="$3"
    
    INSTALL_STATUS["$tool"]="$status"
    INSTALL_NOTES["$tool"]="$note"
}

# Function to try installing a package
try_install() {
    local package="$1"
    local install_cmd="$2"
    
    echo "Attempting to install $package..."
    
    # Try without sudo first
    if $install_cmd 2>/dev/null; then
        echo "$package installed successfully without sudo"
        return 0
    fi
    
    # Try with sudo if available
    if command_exists sudo; then
        echo "Retrying with sudo..."
        if sudo $install_cmd 2>/dev/null; then
            echo "$package installed successfully with sudo"
            return 0
        fi
    fi
    
    echo "Failed to install $package - continuing without it"
    return 1
}

# Platform detection (Fix for Issue #9)
detect_platform() {
    if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || grep -qi microsoft /proc/version 2>/dev/null; then
        echo "windows"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    else
        echo "linux"
    fi
}

PLATFORM=$(detect_platform)

# Install tmux (with Windows detection for Issue #9)
echo "### 🖥️ Tmux Installation" >> "$REPORT_FILE"
if [ "$PLATFORM" == "windows" ]; then
    echo "Windows environment detected - skipping tmux installation"
    record_status "tmux" "⚠️ Skipped" "Not recommended on Windows - use Windows Terminal tabs instead"
    
    # Create Windows Terminal profile as alternative
    cat > ~/.windows-terminal-profile.json << 'EOF'
{
    "name": "DevContainer",
    "commandline": "docker exec -it ${CONTAINER_ID} /bin/bash",
    "icon": "ms-appx:///ProfileIcons/{61c54bbd-c2c6-5271-96e7-009a87ff44bf}.png",
    "colorScheme": "Campbell",
    "startingDirectory": "/workspaces"
}
EOF
    echo "Windows Terminal profile created at ~/.windows-terminal-profile.json"
elif ! command_exists tmux; then
    if command_exists apt-get; then
        if try_install "tmux" "apt-get install -y tmux"; then
            record_status "tmux" "✅ Success" "Installed via apt-get"
        else
            record_status "tmux" "❌ Failed" "Installation failed - see manual instructions below"
        fi
    elif command_exists yum; then
        if try_install "tmux" "yum install -y tmux"; then
            record_status "tmux" "✅ Success" "Installed via yum"
        else
            record_status "tmux" "❌ Failed" "Installation failed - see manual instructions below"
        fi
    elif command_exists apk; then
        if try_install "tmux" "apk add tmux"; then
            record_status "tmux" "✅ Success" "Installed via apk"
        else
            record_status "tmux" "❌ Failed" "Installation failed - see manual instructions below"
        fi
    elif command_exists brew; then
        if try_install "tmux" "brew install tmux"; then
            record_status "tmux" "✅ Success" "Installed via brew"
        else
            record_status "tmux" "❌ Failed" "Installation failed - see manual instructions below"
        fi
    else
        record_status "tmux" "❌ Failed" "No supported package manager found"
    fi
else
    record_status "tmux" "✅ Already Installed" "Version: $(tmux -V 2>/dev/null || echo 'unknown')"
fi

# Install GitHub CLI
echo "### 🐙 GitHub CLI Installation" >> "$REPORT_FILE"
if ! command_exists gh; then
    if command_exists apt-get; then
        # For Debian/Ubuntu systems
        echo "Installing GitHub CLI for Debian/Ubuntu..."
        INSTALL_GH_DEB="(type -p wget >/dev/null || apt-get install wget -y) && \
            wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /usr/share/keyrings/githubcli-archive-keyring.gpg > /dev/null && \
            chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
            echo 'deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main' | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
            apt-get update && \
            apt-get install gh -y"
        
        # Try without sudo first
        if bash -c "$INSTALL_GH_DEB" 2>/dev/null; then
            record_status "gh" "✅ Success" "Installed via apt-get"
        elif command_exists sudo; then
            echo "Retrying GitHub CLI installation with sudo..."
            if sudo bash -c "$INSTALL_GH_DEB" 2>/dev/null; then
                record_status "gh" "✅ Success" "Installed via apt-get with sudo"
            else
                record_status "gh" "❌ Failed" "Installation failed - see manual instructions below"
            fi
        else
            record_status "gh" "❌ Failed" "Installation failed - see manual instructions below"
        fi
    elif command_exists yum; then
        if try_install "gh" "yum install -y gh"; then
            record_status "gh" "✅ Success" "Installed via yum"
        else
            record_status "gh" "❌ Failed" "Installation failed - see manual instructions below"
        fi
    elif command_exists brew; then
        if try_install "gh" "brew install gh"; then
            record_status "gh" "✅ Success" "Installed via brew"
        else
            record_status "gh" "❌ Failed" "Installation failed - see manual instructions below"
        fi
    else
        record_status "gh" "❌ Failed" "No supported package manager found"
    fi
else
    record_status "gh" "✅ Already Installed" "Version: $(gh --version 2>/dev/null | head -n1 || echo 'unknown')"
fi

# Install claude-code
echo "### 🤖 Claude Code Installation" >> "$REPORT_FILE"
if ! command_exists claude-code; then
    # Check for Node.js and npm first
    if command_exists node && command_exists npm; then
        echo "Installing claude-code via npm..."
        
        # Try npm install without sudo first
        if npm install -g @anthropic-ai/claude-code 2>/dev/null; then
            record_status "claude-code" "✅ Success" "Installed via npm"
        elif command_exists sudo; then
            echo "Retrying claude-code installation with sudo..."
            if sudo npm install -g @anthropic-ai/claude-code 2>/dev/null; then
                record_status "claude-code" "✅ Success" "Installed via npm with sudo"
            else
                record_status "claude-code" "❌ Failed" "Installation failed - see manual instructions below"
            fi
        else
            record_status "claude-code" "❌ Failed" "Installation failed - see manual instructions below"
        fi
    else
        record_status "claude-code" "❌ Failed" "Node.js and npm are required but not found"
    fi
else
    record_status "claude-code" "✅ Already Installed" "Version: $(claude-code --version 2>/dev/null || echo 'unknown')"
fi

# Install UV (Python package manager)
echo "### 🐍 UV Installation" >> "$REPORT_FILE"
if ! command_exists uv; then
    echo "Installing UV Python package manager..."
    
    # First, ensure we have curl or wget for downloading
    if command_exists curl; then
        DOWNLOAD_CMD="curl -LsSf"
    elif command_exists wget; then
        DOWNLOAD_CMD="wget -qO-"
    else
        echo "Neither curl nor wget found. Attempting to install curl..."
        if command_exists apt-get; then
            try_install "curl" "apt-get install -y curl"
        elif command_exists yum; then
            try_install "curl" "yum install -y curl"
        elif command_exists apk; then
            try_install "curl" "apk add curl"
        fi
        
        if command_exists curl; then
            DOWNLOAD_CMD="curl -LsSf"
        else
            record_status "uv" "❌ Failed" "Cannot install - neither curl nor wget available"
            echo "Failed to install UV - missing download tools"
        fi
    fi
    
    # If we have a download command, proceed with installation
    if [ -n "${DOWNLOAD_CMD:-}" ]; then
        # UV has a universal installer script
        INSTALL_UV="$DOWNLOAD_CMD https://astral.sh/uv/install.sh | sh"
        
        # Try to install UV using the official installer
        echo "Attempting UV installation via official installer..."
        if bash -c "$INSTALL_UV" 2>/dev/null; then
            # Source the env file to update PATH for current session
            if [ -f "$HOME/.cargo/env" ]; then
                source "$HOME/.cargo/env"
            fi
            # Verify installation
            if command_exists uv; then
                record_status "uv" "✅ Success" "Installed via official installer"
            else
                # PATH might not be updated yet
                if [ -f "$HOME/.cargo/bin/uv" ]; then
                    export PATH="$HOME/.cargo/bin:$PATH"
                    record_status "uv" "✅ Success" "Installed via official installer (PATH updated)"
                else
                    record_status "uv" "⚠️ Partial" "Installed but not in PATH - restart shell"
                fi
            fi
        else
            # Try alternative installation method via pip
            echo "Official installer failed, trying pip installation..."
            if command_exists python3 || command_exists python; then
                PYTHON_CMD=$(command -v python3 || command -v python)
                
                # Check if pip is available
                if $PYTHON_CMD -m pip --version >/dev/null 2>&1; then
                    echo "Installing UV via pip..."
                    
                    if $PYTHON_CMD -m pip install --user uv 2>/dev/null; then
                        record_status "uv" "✅ Success" "Installed via pip (user)"
                    elif command_exists sudo; then
                        echo "Retrying UV installation with sudo..."
                        if sudo $PYTHON_CMD -m pip install uv 2>/dev/null; then
                            record_status "uv" "✅ Success" "Installed via pip (system)"
                        else
                            record_status "uv" "❌ Failed" "All installation methods failed"
                        fi
                    else
                        record_status "uv" "❌ Failed" "pip installation failed without sudo"
                    fi
                else
                    record_status "uv" "❌ Failed" "Python found but pip not available"
                fi
            else
                record_status "uv" "❌ Failed" "Python not found - required for fallback installation"
            fi
        fi
    fi
else
    # UV is already installed
    UV_VERSION=$(uv --version 2>/dev/null | head -n1 || echo 'unknown')
    record_status "uv" "✅ Already Installed" "Version: $UV_VERSION"
    
    # Check if UV is properly configured
    if uv --version >/dev/null 2>&1; then
        echo "UV is properly installed and accessible"
    else
        echo "UV is installed but may have PATH issues"
    fi
fi

# Install claude-monitor using UV
echo "### 📊 Claude Monitor Installation" >> "$REPORT_FILE"
if command_exists uv; then
    # Check if claude-monitor is already installed
    if uv tool list 2>/dev/null | grep -q "claude-monitor"; then
        MONITOR_VERSION=$(uv tool list 2>/dev/null | grep "claude-monitor" | awk '{print $2}' || echo 'unknown')
        record_status "claude-monitor" "✅ Already Installed" "Version: $MONITOR_VERSION"
    else
        echo "Installing claude-monitor via UV..."
        if uv tool install claude-monitor 2>/dev/null; then
            record_status "claude-monitor" "✅ Success" "Installed via UV tool"
        else
            # Try with --force in case of partial installation
            echo "Retrying claude-monitor installation with --force..."
            if uv tool install claude-monitor --force 2>/dev/null; then
                record_status "claude-monitor" "✅ Success" "Installed via UV tool (forced)"
            else
                record_status "claude-monitor" "❌ Failed" "UV tool installation failed"
            fi
        fi
    fi
else
    record_status "claude-monitor" "❌ Failed" "UV not available - install UV first"
fi

# Install claude-flow@alpha
echo "### 🌊 Claude Flow Installation" >> "$REPORT_FILE"
if command_exists npm; then
    # Check if claude-flow is already installed
    if npm list -g claude-flow 2>/dev/null | grep -q "claude-flow@"; then
        FLOW_VERSION=$(npm list -g claude-flow 2>/dev/null | grep "claude-flow@" | grep -oE '@[0-9a-z.-]+' || echo 'unknown')
        record_status "claude-flow" "✅ Already Installed" "Version: $FLOW_VERSION"
        echo "claude-flow is already installed"
    else
        echo "Installing claude-flow@alpha via npm..."
        if npm install -g claude-flow@alpha 2>/dev/null; then
            record_status "claude-flow" "✅ Success" "Installed via npm (alpha)"
        elif command_exists sudo; then
            echo "Retrying claude-flow installation with sudo..."
            if sudo npm install -g claude-flow@alpha 2>/dev/null; then
                record_status "claude-flow" "✅ Success" "Installed via npm with sudo (alpha)"
            else
                record_status "claude-flow" "❌ Failed" "npm installation failed"
            fi
        else
            record_status "claude-flow" "❌ Failed" "npm installation failed without sudo"
        fi
    fi
else
    record_status "claude-flow" "❌ Failed" "npm not available - install Node.js first"
fi

# Install ruv-swarm
echo "### 🐝 RUV Swarm Installation" >> "$REPORT_FILE"
if command_exists npm; then
    # Check if ruv-swarm is already installed
    if npm list -g ruv-swarm 2>/dev/null | grep -q "ruv-swarm@"; then
        SWARM_VERSION=$(npm list -g ruv-swarm 2>/dev/null | grep "ruv-swarm@" | grep -oE '@[0-9a-z.-]+' || echo 'unknown')
        record_status "ruv-swarm" "✅ Already Installed" "Version: $SWARM_VERSION"
        echo "ruv-swarm is already installed"
    else
        echo "Installing ruv-swarm via npm..."
        if npm install -g ruv-swarm 2>/dev/null; then
            record_status "ruv-swarm" "✅ Success" "Installed via npm"
        elif command_exists sudo; then
            echo "Retrying ruv-swarm installation with sudo..."
            if sudo npm install -g ruv-swarm 2>/dev/null; then
                record_status "ruv-swarm" "✅ Success" "Installed via npm with sudo"
            else
                record_status "ruv-swarm" "❌ Failed" "npm installation failed"
            fi
        else
            record_status "ruv-swarm" "❌ Failed" "npm installation failed without sudo"
        fi
    fi
else
    record_status "ruv-swarm" "❌ Failed" "npm not available - install Node.js first"
fi

# Install ccusage
echo "### 📈 CCUsage Installation" >> "$REPORT_FILE"
if command_exists npm; then
    # Check if ccusage is already installed
    if npm list -g ccusage 2>/dev/null | grep -q "ccusage@"; then
        CCUSAGE_VERSION=$(npm list -g ccusage 2>/dev/null | grep "ccusage@" | grep -oE '@[0-9a-z.-]+' || echo 'unknown')
        record_status "ccusage" "✅ Already Installed" "Version: $CCUSAGE_VERSION"
        echo "ccusage is already installed"
    else
        echo "Installing ccusage via npm..."
        if npm install -g ccusage 2>/dev/null; then
            record_status "ccusage" "✅ Success" "Installed via npm"
        elif command_exists sudo; then
            echo "Retrying ccusage installation with sudo..."
            if sudo npm install -g ccusage 2>/dev/null; then
                record_status "ccusage" "✅ Success" "Installed via npm with sudo"
            else
                record_status "ccusage" "❌ Failed" "npm installation failed"
            fi
        else
            record_status "ccusage" "❌ Failed" "npm installation failed without sudo"
        fi
    fi
else
    record_status "ccusage" "❌ Failed" "npm not available - install Node.js first"
fi

# Write the status table to the report
echo "| Tool | Status | Notes |" >> "$REPORT_FILE"
echo "|------|--------|-------|" >> "$REPORT_FILE"
echo "| tmux | ${INSTALL_STATUS[tmux]} | ${INSTALL_NOTES[tmux]} |" >> "$REPORT_FILE"
echo "| GitHub CLI | ${INSTALL_STATUS[gh]} | ${INSTALL_NOTES[gh]} |" >> "$REPORT_FILE"
echo "| Claude Code | ${INSTALL_STATUS[claude-code]} | ${INSTALL_NOTES[claude-code]} |" >> "$REPORT_FILE"
echo "| UV | ${INSTALL_STATUS[uv]} | ${INSTALL_NOTES[uv]} |" >> "$REPORT_FILE"
echo "| Claude Monitor | ${INSTALL_STATUS[claude-monitor]} | ${INSTALL_NOTES[claude-monitor]} |" >> "$REPORT_FILE"
echo "| Claude Flow | ${INSTALL_STATUS[claude-flow]} | ${INSTALL_NOTES[claude-flow]} |" >> "$REPORT_FILE"
echo "| RUV Swarm | ${INSTALL_STATUS[ruv-swarm]} | ${INSTALL_NOTES[ruv-swarm]} |" >> "$REPORT_FILE"
echo "| CCUsage | ${INSTALL_STATUS[ccusage]} | ${INSTALL_NOTES[ccusage]} |" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Add manual installation instructions for failed items
FAILED_ITEMS=0
for tool in tmux gh claude-code uv claude-monitor claude-flow ruv-swarm ccusage; do
    if [[ "${INSTALL_STATUS[$tool]}" == *"Failed"* ]]; then
        ((FAILED_ITEMS++))
    fi
done

if [ $FAILED_ITEMS -gt 0 ]; then
    echo "## ⚠️ Manual Installation Instructions" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "Some tools failed to install automatically. Please follow these instructions to install them manually:" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    if [[ "${INSTALL_STATUS[tmux]}" == *"Failed"* ]]; then
        echo "### 🖥️ Installing tmux manually" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**For Debian/Ubuntu:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "sudo apt update" >> "$REPORT_FILE"
        echo "sudo apt install -y tmux" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**For Red Hat/CentOS/Fedora:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "sudo yum install -y tmux" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**For macOS:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "brew install tmux" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
    
    if [[ "${INSTALL_STATUS[gh]}" == *"Failed"* ]]; then
        echo "### 🐙 Installing GitHub CLI manually" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**For Debian/Ubuntu:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg" >> "$REPORT_FILE"
        echo "sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg" >> "$REPORT_FILE"
        echo 'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null' >> "$REPORT_FILE"
        echo "sudo apt update" >> "$REPORT_FILE"
        echo "sudo apt install gh -y" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**For macOS:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "brew install gh" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**For other systems, visit:** https://github.com/cli/cli#installation" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
    
    if [[ "${INSTALL_STATUS[claude-code]}" == *"Failed"* ]]; then
        echo "### 🤖 Installing Claude Code manually" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "Claude Code requires Node.js and npm to be installed first." >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Step 1: Install Node.js (if not already installed):**" >> "$REPORT_FILE"
        echo "Visit https://nodejs.org/ or use your package manager" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Step 2: Install Claude Code:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "npm install -g @anthropic-ai/claude-code" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**If you get permission errors, try:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "sudo npm install -g @anthropic-ai/claude-code" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
    
    if [[ "${INSTALL_STATUS[uv]}" == *"Failed"* ]]; then
        echo "### 🐍 Installing UV manually" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "UV is a fast Python package manager written in Rust." >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Method 1: Official Installer (Recommended):**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "curl -LsSf https://astral.sh/uv/install.sh | sh" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Method 2: Using pip:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "pip install uv" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Method 3: Using pipx (if installed):**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "pipx install uv" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Method 4: Using Homebrew (macOS/Linux):**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "brew install uv" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**After installation, you may need to add UV to your PATH:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**For more information, visit:** https://github.com/astral-sh/uv" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
    
    if [[ "${INSTALL_STATUS[claude-monitor]}" == *"Failed"* ]]; then
        echo "### 📊 Installing Claude Monitor manually" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "Claude Monitor requires UV to be installed first." >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Step 1: Ensure UV is installed (see UV instructions above)**" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Step 2: Install Claude Monitor using UV:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "uv tool install claude-monitor" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**If the tool is already partially installed, use --force:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "uv tool install claude-monitor --force" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**After installation, claude-monitor commands will be available:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "claude-monitor --help" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**For more information, visit the claude-monitor documentation**" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
    
    if [[ "${INSTALL_STATUS[claude-flow]}" == *"Failed"* ]]; then
        echo "### 🌊 Installing Claude Flow manually" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "Claude Flow requires Node.js and npm to be installed first." >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Install Claude Flow (alpha version):**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "npm install -g claude-flow@alpha" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**If you get permission errors, try:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "sudo npm install -g claude-flow@alpha" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**For more information, visit:** https://github.com/ruvnet/claude-flow" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
    
    if [[ "${INSTALL_STATUS[ruv-swarm]}" == *"Failed"* ]]; then
        echo "### 🐝 Installing RUV Swarm manually" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "RUV Swarm requires Node.js and npm to be installed first." >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Install RUV Swarm:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "npm install -g ruv-swarm" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**If you get permission errors, try:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "sudo npm install -g ruv-swarm" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
    
    if [[ "${INSTALL_STATUS[ccusage]}" == *"Failed"* ]]; then
        echo "### 📈 Installing CCUsage manually" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "CCUsage requires Node.js and npm to be installed first." >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Install CCUsage:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "npm install -g ccusage" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**If you get permission errors, try:**" >> "$REPORT_FILE"
        echo '```bash' >> "$REPORT_FILE"
        echo "sudo npm install -g ccusage" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
else
    echo "## ✅ All Tools Successfully Installed!" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "Your development environment is ready to use. Enjoy coding! 🎉" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "*Report generated at: $(date)*" >> "$REPORT_FILE"

echo "Tool installation script completed"
echo "Installation report saved to: $REPORT_FILE"
echo ""
echo "📋 To view the installation report, run:"
echo "    cat .devcontainer/installation-report.md"