#!/usr/bin/env python3
"""Automated Deployment Workflow

Complete workflow: Deploy -> Test -> Report
"""

import asyncio
import sys
import subprocess
from pathlib import Path

class DeploymentWorkflow:
    def __init__(self):
        self.results = {
            "deployment_status": False,
            "frontend_health": False,
            "login_functionality": False,
            "navigation_functionality": False,
            "overall_success": False,
            "errors": []
        }

    async def run_workflow(self) -> dict:
        """Run complete deployment workflow"""
        print("🚀 Starting Automated Deployment Workflow")
        print("=" * 60)
        
        # Step 1: Check deployment status
        await self.check_deployment_status()
        
        # Step 2: Run frontend health check
        if self.results["deployment_status"]:
            await self.check_frontend_health()
        
        # Step 3: Run login functionality test
        if self.results["frontend_health"]:
            await self.check_login_functionality()
        
        # Step 4: Run navigation functionality test
        if self.results["login_functionality"]:
            await self.check_navigation_functionality()
        
        # Step 5: Generate final report
        self.generate_final_report()
        
        return self.results

    async def check_deployment_status(self):
        """Check if deployment was successful"""
        print("📋 Checking Deployment Status...")
        try:
            # Run railway deployment list
            result = subprocess.run(
                ["railway", "deployment", "list", "--environment", "staging", "--limit", "2"],
                capture_output=True,
                text=True,
                cwd=Path(__file__).parent.parent
            )
            
            if result.returncode == 0:
                output = result.stdout
                if "SUCCESS" in output:
                    print("✅ Latest deployment successful")
                    self.results["deployment_status"] = True
                else:
                    self.add_error("Latest deployment not successful")
            else:
                self.add_error(f"Failed to check deployment status: {result.stderr}")
                
        except Exception as e:
            self.add_error(f"Deployment status check failed: {e}")

    async def check_frontend_health(self):
        """Check frontend health"""
        print("🌐 Checking Frontend Health...")
        try:
            # Run frontend health test
            result = subprocess.run(
                ["python", "scripts/test_staging_login.py"],
                capture_output=True,
                text=True,
                cwd=Path(__file__).parent
            )
            
            if "Frontend Health: ✅" in result.stdout:
                print("✅ Frontend health check passed")
                self.results["frontend_health"] = True
            else:
                self.add_error("Frontend health check failed")
                
        except Exception as e:
            self.add_error(f"Frontend health check failed: {e}")

    async def check_login_functionality(self):
        """Check login functionality"""
        print("🔐 Checking Login Functionality...")
        try:
            # Run UI login test
            result = subprocess.run(
                ["python", "scripts/test_ui_login.py"],
                capture_output=True,
                text=True,
                cwd=Path(__file__).parent
            )
            
            if "Login Success: ✅" in result.stdout:
                print("✅ Login functionality test passed")
                self.results["login_functionality"] = True
            else:
                self.add_error("Login functionality test failed")
                
        except Exception as e:
            self.add_error(f"Login functionality test failed: {e}")

    async def check_navigation_functionality(self):
        """Check navigation functionality"""
        print("🧭 Checking Navigation Functionality...")
        try:
            # Run navigation test
            result = subprocess.run(
                ["python", "scripts/test_navigation.py"],
                capture_output=True,
                text=True,
                cwd=Path(__file__).parent
            )
            
            if "Navigation Success Rate: 5/5" in result.stdout:
                print("✅ Navigation functionality test passed")
                self.results["navigation_functionality"] = True
            else:
                self.add_error("Navigation functionality test failed")
                
        except Exception as e:
            self.add_error(f"Navigation functionality test failed: {e}")

    def add_error(self, error: str):
        """Add error to results"""
        print(f"❌ {error}")
        self.results["errors"].append(error)

    def generate_final_report(self):
        """Generate final deployment report"""
        print("\n" + "=" * 60)
        print("📊 DEPLOYMENT WORKFLOW REPORT")
        print("=" * 60)
        
        checks = [
            ("Deployment Status", self.results["deployment_status"]),
            ("Frontend Health", self.results["frontend_health"]),
            ("Login Functionality", self.results["login_functionality"]),
            ("Navigation Functionality", self.results["navigation_functionality"])
        ]
        
        total_checks = len(checks)
        passed_checks = sum(success for _, success in checks)
        
        for check_name, success in checks:
            status = "✅" if success else "❌"
            print(f"{status} {check_name}")
        
        print(f"\n📈 Overall Success Rate: {passed_checks}/{total_checks} checks passed")
        
        if self.results["errors"]:
            print(f"\n❌ Issues Found ({len(self.results['errors'])}):")
            for i, error in enumerate(self.results["errors"], 1):
                print(f"  {i}. {error}")
        
        # Determine overall success
        self.results["overall_success"] = (
            self.results["deployment_status"] and
            self.results["frontend_health"] and
            self.results["login_functionality"]
        )
        
        if self.results["overall_success"]:
            if self.results["navigation_functionality"]:
                print(f"\n🎉 DEPLOYMENT PERFECT!")
                print(f"   All functionality working correctly")
            else:
                print(f"\n⚠️  DEPLOYMENT ACCEPTABLE")
                print(f"   Core functionality works, navigation needs attention")
        else:
            print(f"\n❌ DEPLOYMENT NEEDS ATTENTION")
            print(f"   Critical functionality issues detected")

async def main():
    """Main workflow runner"""
    workflow = DeploymentWorkflow()
    results = await workflow.run_workflow()
    
    sys.exit(0 if results["overall_success"] else 1)

if __name__ == "__main__":
    asyncio.run(main())