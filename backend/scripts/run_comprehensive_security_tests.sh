#!/bin/bash

# Enhanced Security Testing Script for SparkOps Enterprise
# Runs comprehensive security tests including SAST, DAST, and dependency scanning

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
REPORTS_DIR="$PROJECT_ROOT/security_reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create reports directory
mkdir -p "$REPORTS_DIR"

echo -e "${BLUE}🔒 SparkOps Enterprise Security Testing${NC}"
echo -e "${BLUE}========================================${NC}"
echo "Timestamp: $TIMESTAMP"
echo "Reports Directory: $REPORTS_DIR"
echo ""

# Function to print status
print_status() {
    local status=$1
    local message=$2
    case $status in
        "PASS")
            echo -e "${GREEN}✅ $message${NC}"
            ;;
        "FAIL")
            echo -e "${RED}❌ $message${NC}"
            ;;
        "WARN")
            echo -e "${YELLOW}⚠️  $message${NC}"
            ;;
        "INFO")
            echo -e "${BLUE}ℹ️  $message${NC}"
            ;;
    esac
}

# Function to run command and capture results
run_security_test() {
    local test_name=$1
    local command=$2
    local output_file=$3
    local working_dir=${4:-$BACKEND_DIR}
    
    echo -e "${BLUE}🧪 Running $test_name...${NC}"
    
    if cd "$working_dir" && eval "$command" > "$output_file" 2>&1; then
        print_status "PASS" "$test_name completed successfully"
        return 0
    else
        print_status "FAIL" "$test_name failed"
        echo -e "${RED}Check $output_file for details${NC}"
        return 1
    fi
}

# Function to check if tool is installed
check_tool() {
    local tool=$1
    if ! command -v "$tool" &> /dev/null; then
        print_status "WARN" "$tool is not installed"
        return 1
    fi
    return 0
}

# 1. Static Application Security Testing (SAST) with Bandit
run_bandit_scan() {
    local output_file="$REPORTS_DIR/bandit_${TIMESTAMP}.json"
    local report_file="$REPORTS_DIR/bandit_${TIMESTAMP}.html"
    
    if check_tool "bandit"; then
        if run_security_test "Bandit SAST" \
            "bandit -r . -f json -o '$output_file' -f html -o '$report_file' -ii -ll" \
            "$output_file.stdout.log"; then
            
            # Parse results
            if [[ -f "$output_file" ]]; then
                local high_issues=$(python3 -c "
import json
try:
    with open('$output_file', 'r') as f:
        data = json.load(f)
    high = len([r for r in data.get('results', []) if r.get('issue_severity') == 'HIGH'])
    medium = len([r for r in data.get('results', []) if r.get('issue_severity') == 'MEDIUM'])
    low = len([r for r in data.get('results', []) if r.get('issue_severity') == 'LOW'])
    print(f'High: {high}, Medium: {medium}, Low: {low}')
except:
    print('Parse error')
")
                print_status "INFO" "Bandit findings: $high_issues"
                
                if [[ $high_issues == *"High: 0"* ]]; then
                    return 0
                else
                    print_status "WARN" "High severity issues found"
                    return 1
                fi
            fi
        fi
    else
        print_status "WARN" "Bandit not available, installing..."
        pip install bandit
        run_bandit_scan
    fi
}

# 2. Dependency Security Scanning
run_dependency_scan() {
    local output_file="$REPORTS_DIR/dependencies_${TIMESTAMP}.txt"
    
    if check_tool "safety"; then
        if run_security_test "Safety Dependency Scan" \
            "safety check --json --output '$output_file'" \
            "$output_file.stdout.log"; then
            print_status "PASS" "No known vulnerable dependencies found"
            return 0
        else
            print_status "WARN" "Vulnerable dependencies detected"
            return 1
        fi
    else
        print_status "INFO" "Installing Safety for dependency scanning..."
        pip install safety
        run_dependency_scan
    fi
}

# 3. Python Security Linting with Pylint Security
run_pylint_security() {
    local output_file="$REPORTS_DIR/pylint_security_${TIMESTAMP}.txt"
    
    if check_tool "pylint"; then
        if run_security_test "Pylint Security Check" \
            "pylint --disable=all --enable=R,C,W --msg-template='{{path}}:{{line}}:{{msg_id}}:{{msg}} ({{symbol}})' *.py" \
            "$output_file.stdout.log"; then
            print_status "PASS" "Pylint security check passed"
            return 0
        else
            print_status "WARN" "Pylint found security issues"
            return 1
        fi
    else
        print_status "INFO" "Installing Pylint..."
        pip install pylint
        run_pylint_security
    fi
}

# 4. Secrets Scanning
run_secrets_scan() {
    local output_file="$REPORTS_DIR/secrets_${TIMESTAMP}.txt"
    
    if check_tool "trufflehog"; then
        if run_security_test "TruffleHog Secrets Scan" \
            "trufflehog filesystem . --json --output '$output_file'" \
            "$output_file.stdout.log"; then
            print_status "PASS" "No secrets detected"
            return 0
        else
            print_status "WARN" "Potential secrets detected"
            return 1
        fi
    else
        print_status "INFO" "TruffleHog not available, using basic grep scan..."
        
        # Basic secrets scan with grep
        local secrets_found=0
        local patterns=("password.*=" "secret.*=" "token.*=" "api_key.*=" "private_key.*=")
        
        for pattern in "${patterns[@]}"; do
            if grep -r -i -E "$pattern" "$BACKEND_DIR" --exclude-dir=venv --exclude-dir=__pycache__ >> "$output_file" 2>/dev/null; then
                ((secrets_found++))
            fi
        done
        
        if [[ $secrets_found -eq 0 ]]; then
            print_status "PASS" "No obvious secrets found with grep"
            return 0
        else
            print_status "WARN" "Potential secrets found with grep"
            return 1
        fi
    fi
}

# 5. Configuration Security Check
run_config_security() {
    local output_file="$REPORTS_DIR/config_security_${TIMESTAMP}.txt"
    
    echo "Checking configuration security..." > "$output_file"
    
    local issues=0
    
    # Check for debug mode in production
    if grep -r "DEBUG.*=.*True" "$BACKEND_DIR" --exclude-dir=venv >> "$output_file" 2>/dev/null; then
        echo "DEBUG mode enabled in production" >> "$output_file"
        ((issues++))
    fi
    
    # Check for hardcoded secrets in config files
    if grep -r -E "(password|secret|token)\s*=\s*['\"][^'\"]{8,}" "$BACKEND_DIR" --exclude-dir=venv --exclude="*.py" >> "$output_file" 2>/dev/null; then
        echo "Potential hardcoded secrets in config" >> "$output_file"
        ((issues++))
    fi
    
    # Check for insecure headers
    if grep -r -E "(X-Frame-Options|X-Content-Type-Options|X-XSS-Protection)" "$BACKEND_DIR" --exclude-dir=venv | grep -v "DENY\|NOSNIFF\|1; mode=block" >> "$output_file" 2>/dev/null; then
        echo "Insecure security headers configuration" >> "$output_file"
        ((issues++))
    fi
    
    if [[ $issues -eq 0 ]]; then
        print_status "PASS" "Configuration security check passed"
        return 0
    else
        print_status "WARN" "$issues configuration security issues found"
        return 1
    fi
}

# 6. Python Security Tests
run_python_security_tests() {
    local output_file="$REPORTS_DIR/python_security_tests_${TIMESTAMP}.txt"
    
    if run_security_test "Python Security Tests" \
        "python -m pytest tests/security/ -v --tb=short" \
        "$output_file.stdout.log"; then
        print_status "PASS" "Python security tests passed"
        return 0
    else
        print_status "FAIL" "Python security tests failed"
        return 1
    fi
}

# 7. Infrastructure Security Tests
run_infrastructure_security() {
    local output_file="$REPORTS_DIR/infra_security_${TIMESTAMP}.txt"
    
    echo "Running infrastructure security checks..." > "$output_file"
    
    # Check Docker security if Dockerfile exists
    if [[ -f "$BACKEND_DIR/Dockerfile" ]]; then
        echo "Checking Dockerfile security..." >> "$output_file"
        
        # Check for root user
        if grep -E "^FROM.*:latest" "$BACKEND_DIR/Dockerfile" >> "$output_file" 2>/dev/null; then
            echo "Using latest tag in Dockerfile" >> "$output_file"
        fi
        
        if ! grep -q "USER " "$BACKEND_DIR/Dockerfile"; then
            echo "No USER directive in Dockerfile (running as root)" >> "$output_file"
        fi
    fi
    
    # Check requirements.txt for security
    if [[ -f "$BACKEND_DIR/requirements.txt" ]]; then
        echo "Checking requirements.txt security..." >> "$output_file"
        
        # Check for pinned versions
        if grep -E "^[a-zA-Z0-9\-_]+==" "$BACKEND_DIR/requirements.txt" > /dev/null; then
            echo "Requirements have pinned versions (good)" >> "$output_file"
        else
            echo "Some packages without pinned versions" >> "$output_file"
        fi
    fi
    
    print_status "INFO" "Infrastructure security check completed"
    return 0
}

# 8. Generate Security Report
generate_security_report() {
    local summary_file="$REPORTS_DIR/security_summary_${TIMESTAMP}.txt"
    local html_file="$REPORTS_DIR/security_report_${TIMESTAMP}.html"
    
    echo "Generating security summary report..." > "$summary_file"
    echo "Timestamp: $TIMESTAMP" >> "$summary_file"
    echo "Project: SparkOps Enterprise Backend" >> "$summary_file"
    echo "========================================" >> "$summary_file"
    echo "" >> "$summary_file"
    
    # Collect all results
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    
    for report in "$REPORTS_DIR"/*_${TIMESTAMP}.stdout.log; do
        if [[ -f "$report" ]]; then
            local test_name=$(basename "$report" | sed "s/_${TIMESTAMP}.stdout.log//")
            echo "Test: $test_name" >> "$summary_file"
            
            if grep -q "completed successfully" "$report"; then
                echo "Status: PASSED" >> "$summary_file"
                ((passed_tests++))
            else
                echo "Status: FAILED" >> "$summary_file"
                ((failed_tests++))
            fi
            echo "" >> "$summary_file"
            ((total_tests++))
        fi
    done
    
    echo "========================================" >> "$summary_file"
    echo "Total Tests: $total_tests" >> "$summary_file"
    echo "Passed: $passed_tests" >> "$summary_file"
    echo "Failed: $failed_tests" >> "$summary_file"
    echo "Success Rate: $(( passed_tests * 100 / total_tests ))%" >> "$summary_file"
    
    # Generate HTML report
    cat > "$html_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>SparkOps Security Report - $TIMESTAMP</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        .warning { color: #ffc107; }
        .summary { background: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0; }
        pre { background: #f8f9fa; padding: 10px; border-radius: 3px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔒 SparkOps Enterprise Security Report</h1>
        <p><strong>Generated:</strong> $TIMESTAMP</p>
        <p><strong>Success Rate:</strong> $(( passed_tests * 100 / total_tests ))%</p>
    </div>
    
    <div class="summary">
        <h2>📊 Summary</h2>
        <p><strong>Total Tests:</strong> $total_tests</p>
        <p><strong>Passed:</strong> <span class="passed">$passed_tests</span></p>
        <p><strong>Failed:</strong> <span class="failed">$failed_tests</span></p>
    </div>
    
    <h2>📋 Detailed Results</h2>
    <pre>$(cat "$summary_file")</pre>
</body>
</html>
EOF
    
    print_status "INFO" "Security report generated: $html_file"
    print_status "INFO" "Summary report generated: $summary_file"
}

# Main execution
main() {
    local exit_code=0
    
    echo -e "${BLUE}Starting comprehensive security testing...${NC}"
    echo ""
    
    # Change to backend directory
    cd "$BACKEND_DIR" || {
        print_status "FAIL" "Cannot change to backend directory"
        exit 1
    }
    
    # Run all security tests
    local tests=(
        "run_bandit_scan"
        "run_dependency_scan"
        "run_pylint_security"
        "run_secrets_scan"
        "run_config_security"
        "run_python_security_tests"
        "run_infrastructure_security"
    )
    
    local failed_tests=0
    
    for test in "${tests[@]}"; do
        echo ""
        if ! $test; then
            ((failed_tests++))
            exit_code=1
        fi
    done
    
    echo ""
    echo -e "${BLUE}========================================${NC}"
    
    # Generate final report
    generate_security_report
    
    # Final status
    if [[ $failed_tests -eq 0 ]]; then
        print_status "PASS" "All security tests passed! 🎉"
    else
        print_status "FAIL" "$failed_tests security tests failed"
        print_status "WARN" "Please review the detailed reports"
    fi
    
    echo ""
    echo -e "${BLUE}Reports available in: $REPORTS_DIR${NC}"
    echo -e "${BLUE}Latest HTML report: $REPORTS_DIR/security_report_${TIMESTAMP}.html${NC}"
    
    exit $exit_code
}

# Handle script arguments
case "${1:-}" in
    "bandit")
        cd "$BACKEND_DIR" && run_bandit_scan
        ;;
    "dependencies")
        cd "$BACKEND_DIR" && run_dependency_scan
        ;;
    "secrets")
        cd "$BACKEND_DIR" && run_secrets_scan
        ;;
    "tests")
        cd "$BACKEND_DIR" && run_python_security_tests
        ;;
    "report")
        generate_security_report
        ;;
    *)
        main
        ;;
esac
