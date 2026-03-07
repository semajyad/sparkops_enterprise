#!/usr/bin/env python3
"""Automated deployment workflow for SparkOps staging

This script automates the complete deployment pipeline:
1. Check git status
2. Commit changes
3. Push to dev branch
4. Trigger Railway deployment
5. Run login tests
6. Monitor logs
7. Report results
"""

import asyncio
import json
import subprocess
import sys
import time
from typing import Dict, Any, List
import httpx

# Configuration
BACKEND_URL = "https://sparkopsstagingbackend-staging.up.railway.app"
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"

class StagingDeploymentWorkflow:
    def __init__(self):
        self.results = {
            "git_status": False,
            "git_commit": False,
            "git_push": False,
            "deployment": False,
            "login_test": False,
            "errors": []
        }

    async def run_workflow(self) -> Dict[str, Any]:
        """Run complete deployment workflow"""
        print("🚀 Starting SparkOps Staging Deployment Workflow")
        print("=" * 60)
        
        # Step 1: Check git status
        await self.check_git_status()
        
        # Step 2: Commit changes (if any)
        if self.results["git_status"]:
            await self.commit_changes()
        
        # Step 3: Push to dev branch
        if self.results["git_commit"]:
            await self.push_changes()
        
        # Step 4: Wait for deployment
        if self.results["git_push"]:
            await self.wait_for_deployment()
        
        # Step 5: Run login tests
        if self.results["deployment"]:
            await self.run_login_tests()
        
        # Step 6: Final report
        self.print_final_report()
        
        return self.results

    async def check_git_status(self):
        """Check if there are changes to commit"""
        print("📋 Checking Git Status...")
        try:
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                capture_output=True,
                text=True,
                cwd="c:\\Users\\jimmy\\CascadeProjects\\sparkops_enterprise"
            )
            
            if result.returncode == 0:
                changes = result.stdout.strip()
                if changes:
                    print(f"✅ Found changes to commit:\n{changes}")
                    self.results["git_status"] = True
                else:
                    print("ℹ️  No changes to commit")
                    self.results["git_status"] = True  # No changes is OK
                return True
            else:
                self.add_error(f"Git status failed: {result.stderr}")
                return False
        except Exception as e:
            self.add_error(f"Git status check failed: {e}")
            return False

    async def commit_changes(self):
        """Commit all changes"""
        print("💾 Committing Changes...")
        try:
            # Add all changes
            add_result = subprocess.run(
                ["git", "add", "."],
                capture_output=True,
                text=True,
                cwd="c:\\Users\\jimmy\\CascadeProjects\\sparkops_enterprise"
            )
            
            if add_result.returncode != 0:
                self.add_error(f"Git add failed: {add_result.stderr}")
                return False
            
            # Commit with timestamp
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            commit_message = f"Auto-deploy: {timestamp}\n\nAutomated deployment to staging environment"
            
            commit_result = subprocess.run(
                ["git", "commit", "-m", commit_message],
                capture_output=True,
                text=True,
                cwd="c:\\Users\\jimmy\\CascadeProjects\\sparkops_enterprise"
            )
            
            if commit_result.returncode == 0:
                print("✅ Changes committed successfully")
                self.results["git_commit"] = True
                return True
            else:
                # Check if it's because nothing to commit
                if "nothing to commit" in commit_result.stdout.lower():
                    print("ℹ️  Nothing to commit (working tree clean)")
                    self.results["git_commit"] = True
                    return True
                else:
                    self.add_error(f"Git commit failed: {commit_result.stderr}")
                    return False
                    
        except Exception as e:
            self.add_error(f"Git commit failed: {e}")
            return False

    async def push_changes(self):
        """Push changes to dev branch"""
        print("📤 Pushing to Dev Branch...")
        try:
            result = subprocess.run(
                ["git", "push", "origin", "dev"],
                capture_output=True,
                text=True,
                cwd="c:\\Users\\jimmy\\CascadeProjects\\sparkops_enterprise"
            )
            
            if result.returncode == 0:
                print("✅ Changes pushed successfully")
                self.results["git_push"] = True
                return True
            else:
                self.add_error(f"Git push failed: {result.stderr}")
                return False
        except Exception as e:
            self.add_error(f"Git push failed: {e}")
            return False

    async def wait_for_deployment(self, timeout_seconds: int = 300):
        """Wait for Railway deployment to complete"""
        print("⏳ Waiting for Railway Deployment...")
        print(f"   Timeout: {timeout_seconds} seconds")
        
        start_time = time.time()
        
        while time.time() - start_time < timeout_seconds:
            try:
                # Check backend health
                async with httpx.AsyncClient(timeout=10.0) as client:
                    backend_response = await client.get(f"{BACKEND_URL}/health")
                    frontend_response = await client.get(FRONTEND_URL)
                    
                    if backend_response.status_code == 200 and frontend_response.status_code == 200:
                        print("✅ Deployment completed successfully")
                        self.results["deployment"] = True
                        return True
                    else:
                        print(f"   ⏳ Waiting... (Backend: {backend_response.status_code}, Frontend: {frontend_response.status_code})")
                        await asyncio.sleep(15)
                        
            except Exception as e:
                print(f"   ⏳ Waiting... (Health check failed: {str(e)[:50]}...)")
                await asyncio.sleep(15)
        
        self.add_error(f"Deployment timeout after {timeout_seconds} seconds")
        return False

    async def run_login_tests(self):
        """Run login tests after deployment"""
        print("🧪 Running Login Tests...")
        try:
            # Import and run the login test
            sys.path.append("c:\\Users\\jimmy\\CascadeProjects\\sparkops_enterprise\\backend\\scripts")
            from test_staging_login import StagingLoginTest
            
            tester = StagingLoginTest()
            test_results = await tester.run_all_tests()
            
            # Check if all tests passed
            if all([
                test_results["frontend_health"],
                test_results["backend_health"],
                test_results["login_test"],
                test_results["auth_test"]
            ]):
                print("✅ All login tests passed")
                self.results["login_test"] = True
                return True
            else:
                self.add_error("Login tests failed")
                self.results["errors"].extend(test_results["errors"])
                return False
                
        except Exception as e:
            self.add_error(f"Login test execution failed: {e}")
            return False

    def add_error(self, error: str):
        """Add error to results"""
        print(f"❌ {error}")
        self.results["errors"].append(error)

    def print_final_report(self):
        """Print final deployment report"""
        print("\n" + "=" * 60)
        print("📊 DEPLOYMENT WORKFLOW RESULTS")
        print("=" * 60)
        
        steps = [
            ("Git Status", self.results["git_status"]),
            ("Git Commit", self.results["git_commit"]),
            ("Git Push", self.results["git_push"]),
            ("Deployment", self.results["deployment"]),
            ("Login Tests", self.results["login_test"])
        ]
        
        for step_name, success in steps:
            status = "✅" if success else "❌"
            print(f"{status} {step_name}")
        
        total_steps = len(steps)
        passed_steps = sum(success for _, success in steps)
        
        print(f"\n📈 Success Rate: {passed_steps}/{total_steps} steps completed")
        
        if self.results["errors"]:
            print(f"\n❌ Errors ({len(self.results['errors'])}):")
            for i, error in enumerate(self.results["errors"], 1):
                print(f"  {i}. {error}")
        
        # Overall status
        if passed_steps == total_steps:
            print("\n🎉 DEPLOYMENT WORKFLOW COMPLETED SUCCESSFULLY!")
            print("   Staging environment is ready for use")
        else:
            print(f"\n⚠️  {total_steps - passed_steps} step(s) failed")
            print("   Please check the errors and retry the deployment")
        
        print(f"\n🌐 Frontend: {FRONTEND_URL}")
        print(f"🔧 Backend: {BACKEND_URL}")

async def main():
    """Main workflow runner"""
    workflow = StagingDeploymentWorkflow()
    results = await workflow.run_workflow()
    
    # Exit with appropriate code
    success = all([
        results["git_status"],
        results["git_commit"],
        results["git_push"],
        results["deployment"],
        results["login_test"]
    ])
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())