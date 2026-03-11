---
description: Non-Interactive Command Enforcement Rule
---

# 🚫 Non-Interactive Command Enforcement Rule

This rule ensures that Cascade never hangs waiting for user input by enforcing non-interactive shell practices with automatic confirmation flags.

## Rule Activation

This rule is automatically triggered when ANY command is executed that could potentially hang waiting for user input:
- Package installations (npm, pip, apt, yum)
- File system operations (rm, cp, mv with destructive operations)
- Docker operations (prune, rmi, system prune)
- Git operations (clean, reset, prune)
- System operations (reboot, shutdown, service restart)

## Zero-Tolerance Policy

**NEVER run commands that halt execution for user confirmation.** All commands must be non-interactive in unattended environments.

## Required Confirmation Flags

### Package Managers
```bash
# npm/yarn
npm install -y                    # Auto-confirm all prompts
npm uninstall -y                   # Auto-confirm uninstall
yarn install --non-interactive     # No interactive prompts
yarn global add -f                  # Force installation

# pip
pip install --yes                  # Auto-confirm (if supported)
pip install --no-input             # No interactive input

# apt/debian
apt-get install -y                 # Auto-confirm installation
apt-get remove -y                   # Auto-confirm removal
apt-get upgrade -y                  # Auto-confirm upgrades

# yum/rhel
yum install -y                      # Auto-confirm installation
yum remove -y                       # Auto-confirm removal
yum update -y                       # Auto-confirm updates
```

### File System Operations
```bash
# Destructive operations
rm -rf /path/* --force             # Bypass confirmation prompts
rm -rf /path/* --no-preserve-root   # Skip root protection warnings
cp -rf source dest --force          # Force overwrite
mv -f source dest                   # Force move/overwrite

# Disk operations
diskutil eraseDisk HFS+ diskName --force  # Force disk operations
```

### Docker Operations
```bash
# Cleanup operations
docker system prune -f              # Force prune without confirmation
docker container prune -f           # Force container prune
docker image prune -f                # Force image prune
docker network prune -f             # Force network prune
docker volume prune -f              # Force volume prune

# Removal operations
docker rmi -f image:tag             # Force image removal
docker rm -f container_name         # Force container removal
docker system df --force            # Force disk usage check
```

### Git Operations
```bash
# Cleanup operations
git clean -fd --force               # Force clean without confirmation
git clean -fdx --force              # Force clean including ignored files
git reset --hard HEAD               # Force reset (no confirmation needed)
git stash clear --force             # Force stash clear

# Branch operations
git branch -D branch_name --force   # Force branch deletion
git push -f origin branch_name       # Force push (use with caution)
```

### System Operations
```bash
# Service operations
systemctl restart service --force   # Force service restart
systemctl stop service --force      # Force service stop

# Reboot/shutdown (rarely used)
# These should generally be avoided in automation
# If absolutely necessary: echo "y" | reboot
```

## Forbidden Command Patterns

### ❌ NEVER USE These Commands
```bash
# Package managers without confirmation flags
npm install                         # Waits for user input
pip install package_name            # May ask for confirmation
apt-get install package             # Prompts for Y/N
yum install package                  # Prompts for Y/N

# File operations without force flags
rm -rf /path/*                     # May prompt for confirmation
cp -rf source dest                 # May prompt for overwrite
mv source dest                      # May prompt for overwrite

# Docker operations without force
docker system prune                 # Asks "Are you sure?"
docker rmi image:tag               # May prompt for confirmation
docker container prune              # Asks for confirmation

# Git operations without force
git clean -fd                      # Prompts for confirmation
git branch -D branch_name           # May prompt for confirmation
```

## Command Validation Checklist

Before executing any command, verify:

### ✅ Safety Check
- [ ] Command has appropriate confirmation flag (-y, --force, -f)
- [ ] Command won't hang waiting for user input
- [ ] Command is safe for unattended execution
- [ ] Command won't prompt for passwords or sensitive input

### ✅ Environment Check
- [ ] Running in non-interactive environment
- [ ] No TTY attached to command
- [ ] Environment variables set appropriately
- [ ] Working directory is correct

### ✅ Risk Assessment
- [ ] Destructive operations are intentional
- [ ] Backup/rollback plan exists if needed
- [ ] Command won't affect other processes
- [ ] Resource usage is acceptable

## Automatic Detection and Correction

### Pattern Recognition
The system automatically detects potentially interactive commands and adds required flags:

```bash
# Input: npm install
# Output: npm install -y

# Input: docker system prune  
# Output: docker system prune -f

# Input: git clean -fd
# Output: git clean -fd --force
```

### Smart Flag Addition
- `-y` for package installations
- `--force` or `-f` for destructive operations
- `--no-interactive` for batch operations
- `--batch` for automated operations

## Error Handling

### Interactive Command Detection
If an interactive command is detected:
1. **STOP EXECUTION** immediately
2. **ADD REQUIRED FLAGS** automatically
3. **RETRY WITH FLAGS** 
4. **LOG CORRECTION** for learning

### Timeout Protection
- Commands that hang > 30 seconds are auto-killed
- Interactive prompts are detected and terminated
- Process monitoring prevents hanging operations

## Integration with Skills

### @quality-verification
- Validates all commands are non-interactive
- Checks for required confirmation flags
- Ensures unattended execution safety

### @workflow-monitor
- Monitors command execution for hanging
- Detects interactive prompts automatically
- Terminates hanging processes

### @self-healing
- Auto-corrects interactive commands
- Adds missing confirmation flags
- Retries with proper flags

## Enforcement Mechanism

### Pre-Execution Validation
1. **Command Analysis**: Check for interactive patterns
2. **Flag Validation**: Ensure required flags present
3. **Safety Check**: Verify unattended execution safety
4. **Auto-Correction**: Add missing flags automatically

### Runtime Monitoring
1. **Process Monitoring**: Track command execution
2. **Timeout Detection**: Kill hanging processes
3. **Interactive Detection**: Identify and terminate prompts
4. **Progress Reporting**: Provide execution status

### Post-Execution Learning
1. **Success Patterns**: Store working command patterns
2. **Failure Analysis**: Learn from interactive command failures
3. **Flag Optimization**: Improve automatic flag addition
4. **Pattern Updates**: Update command pattern database

## Testing and Verification

### Automated Tests
- Test all command patterns have proper flags
- Verify timeout protection works
- Confirm interactive command detection
- Validate auto-correction functionality

### Manual Verification
- Test common interactive scenarios
- Verify timeout handling
- Confirm error recovery
- Test edge cases and unusual commands

## Documentation and Training

### Command Reference
- Complete list of required flags by command type
- Examples of correct vs incorrect usage
- Troubleshooting guide for hanging commands
- Best practices for unattended execution

### Team Training
- Educate on non-interactive command requirements
- Provide command pattern reference
- Teach troubleshooting techniques
- Share learning from past failures

## 🚫 Terminal Loop Prevention (MANDATORY)

### Zero-Tolerance Policy for Infinite Loops
**NEVER allow commands that can create infinite loops or hang indefinitely.** All commands must have built-in loop protection and timeout mechanisms.

### Common Loop Scenarios to Prevent

#### 1. While Loops Without Exit Conditions
```bash
❌ NEVER USE:
while true; do
  # Some operation without break
done

✅ ALWAYS USE:
while true; do
  # Some operation
  if [ condition ]; then break; fi
  sleep 1
done
```

#### 2. For Loops with Infinite Ranges
```bash
❌ NEVER USE:
for ((;;)); do
  # Operation without break
done

✅ ALWAYS USE:
for i in {1..100}; do
  # Operation
  if [ condition ]; then break; fi
done
```

#### 3. Read Loops Without End Conditions
```bash
❌ NEVER USE:
cat file | while read line; do
  # Process without exit condition
done

✅ ALWAYS USE:
cat file | while read line; do
  # Process
  ((count++))
  if [ $count -gt 1000 ]; then break; fi
done
```

#### 4. Network Wait Loops
```bash
❌ NEVER USE:
while ! curl -s http://example.com > /dev/null; do
  sleep 1
done

✅ ALWAYS USE:
timeout 300 bash -c '
while ! curl -s http://example.com > /dev/null; do
  sleep 1
done
'
```

### Loop Protection Mechanisms

#### Timeout Wrappers
```bash
# Use timeout command for any potentially hanging operation
timeout 300 command_that_might_hang
timeout 600s script_with_loops

# Use timeout with signal handling
timeout -s SIGTERM 300 command
```

#### Counter-Based Limits
```bash
# Add iteration counters
counter=0
while [ $counter -lt 100 ]; do
  # Operation
  ((counter++))
  if [ condition ]; then break; fi
done
```

#### Time-Based Limits
```bash
# Add time limits
start_time=$(date +%s)
timeout_duration=300

while true; do
  current_time=$(date +%s)
  if [ $((current_time - start_time)) -gt $timeout_duration ]; then
    echo "Timeout reached, breaking loop"
    break
  fi
  # Operation
  if [ condition ]; then break; fi
  sleep 1
done
```

### Specific Command Loop Prevention

#### Package Installation Loops
```bash
❌ NEVER USE:
while ! npm install; do
  echo "Retrying..."
done

✅ ALWAYS USE:
timeout 300 bash -c '
while ! npm install -y; do
  echo "Retrying..."
  sleep 5
  ((retry_count++))
  if [ $retry_count -gt 10 ]; then
    echo "Max retries reached"
    exit 1
  fi
done
'
```

#### Service Wait Loops
```bash
❌ NEVER USE:
while ! systemctl is-active service; do
  sleep 1
done

✅ ALWAYS USE:
timeout 300 bash -c '
counter=0
while ! systemctl is-active service; do
  sleep 1
  ((counter++))
  if [ $counter -gt 300 ]; then
    echo "Service not ready after 5 minutes"
    exit 1
  fi
done
'
```

#### File Wait Loops
```bash
❌ NEVER USE:
while [ ! -f /path/to/file ]; do
  sleep 1
done

✅ ALWAYS USE:
timeout 300 bash -c '
counter=0
while [ ! -f /path/to/file ]; do
  sleep 1
  ((counter++))
  if [ $counter -gt 300 ]; then
    echo "File not found after 5 minutes"
    exit 1
  fi
done
'
```

### Loop Detection and Prevention

#### Pre-Execution Loop Analysis
Before executing any command, check for:
1. **Infinite loop patterns**: `while true`, `for ((;;))`
2. **Missing break conditions**: Loops without exit criteria
3. **No timeout protection**: Commands that can run forever
4. **Resource exhaustion**: Loops that consume resources indefinitely

#### Automatic Loop Protection
```bash
# Function to wrap any command with timeout and loop protection
safe_execute() {
  local command="$1"
  local timeout_duration="${2:-300}"
  
  timeout "$timeout_duration" bash -c "
    # Set up signal handlers
    trap 'echo \"Command timed out or interrupted\"; exit 1' TERM INT
  
    # Execute with loop detection
    $command
  "
}
```

#### Monitoring and Termination
```bash
# Monitor for stuck processes
monitor_stuck_processes() {
  # Kill processes running longer than threshold
  ps aux | awk '$8 > "00:30" {print $2}' | xargs -r kill -9
  
  # Monitor for high CPU usage loops
  top -b -n 1 | awk '$9 > 90.0 {print $1}' | xargs -r kill -9
}
```

### Testing Commands with Loop Protection

#### Playwright with Loop Prevention
```bash
# Add timeout and process monitoring
timeout 600 npx playwright test tests/e2e/signup-e2e.spec.ts \
  --timeout=60000 \
  --max-failures=3 \
  --workers=1
```

#### Backend Tests with Loop Prevention
```bash
# Add timeout and resource limits
timeout 300 pytest --cov=. --timeout=300 --maxfail=5 \
  --disable-warnings \
  --tb=short
```

### Emergency Loop Termination

#### Process Cleanup Commands
```bash
# Kill all processes matching pattern
pkill -f "stuck_process_pattern"

# Force kill if needed
pkill -9 -f "hanging_command"

# Kill by user
pkill -u username -f "problematic_process"

# System-wide cleanup for stuck terminals
killall -9 terminal_process_name
```

#### Terminal Session Recovery
```bash
# Exit stuck terminal session
exit

# Force close terminal
pkill -f terminal_emulator

# Reset terminal state
reset
stty sane
```

### Loop Prevention Checklist

Before executing any command with loops:

#### ✅ Safety Check
- [ ] Loop has clear exit condition
- [ ] Timeout protection is in place
- [ ] Resource limits are defined
- [ ] Signal handlers are configured

#### ✅ Monitoring Check
- [ ] Process monitoring is enabled
- [ ] Resource usage is limited
- [ ] Emergency termination is available
- [ ] Logging is sufficient for debugging

#### ✅ Recovery Check
- [ ] Cleanup procedures are defined
- [ ] Rollback plan exists
- [ ] Alternative approaches are available
- [ ] Failure modes are documented

### Integration with Skills

#### @workflow-monitor
- Monitors for stuck processes and loops
- Detects high CPU usage patterns
- Terminates hanging operations automatically

#### @self-healing
- Implements automatic loop termination
- Provides fallback mechanisms
- Recovers from stuck terminal sessions

#### @quality-verification
- Validates loop protection in commands
- Checks for timeout mechanisms
- Ensures proper resource limits

---

**This rule ensures Cascade never gets stuck in terminal loops, maintaining reliable automation and preventing workflow interruptions.**
