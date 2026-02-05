"""
OpsBot - Operations management.

Features:
- Database backup/restore
- Health monitoring
- System metrics
"""
from typing import Any, Dict
import os
import shutil
from nova_bots.base import BaseBot, BotResult


class OpsBot(BaseBot):
    """Operations bot for system management."""
    
    async def execute(self, action: str, input_data: Dict[str, Any]) -> BotResult:
        """Execute an ops bot action."""
        self.reset_steps()
        
        try:
            if action == "backup":
                return await self._backup(input_data)
            elif action == "restore":
                return await self._restore(input_data)
            elif action == "health_check":
                return await self._health_check(input_data)
            elif action == "get_metrics":
                return await self._get_metrics(input_data)
            else:
                return BotResult(success=False, data={}, error=f"Unknown action: {action}")
        except Exception as e:
            return BotResult(success=False, data={}, error=str(e), steps=self.get_steps())
    
    async def _backup(self, input_data: Dict[str, Any]) -> BotResult:
        """Create database backup."""
        db_path = input_data.get("db_path", "./data/nova.db")
        backup_dir = input_data.get("backup_dir", "./data/backups")
        
        self.log_step("start_backup", {"source": db_path, "backup_dir": backup_dir})
        
        # Create backup directory
        os.makedirs(backup_dir, exist_ok=True)
        
        # Create backup filename with timestamp
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(backup_dir, f"nova_backup_{timestamp}.db")
        
        if os.path.exists(db_path):
            shutil.copy2(db_path, backup_path)
            self.log_step("complete_backup", {"backup_path": backup_path})
            return BotResult(
                success=True,
                data={"backup_path": backup_path, "timestamp": timestamp},
                steps=self.get_steps()
            )
        else:
            self.log_step("backup_skipped", {"reason": "source_not_found"})
            return BotResult(
                success=True,
                data={"backup_path": None, "note": "Source database not found"},
                steps=self.get_steps()
            )
    
    async def _restore(self, input_data: Dict[str, Any]) -> BotResult:
        """Restore from backup (simulation)."""
        backup_path = input_data.get("backup_path", "")
        
        self.log_step("restore", {
            "backup_path": backup_path,
            "simulated": True,
            "note": "Restore requires manual verification"
        })
        
        return BotResult(
            success=True,
            data={
                "restore": {
                    "backup_path": backup_path,
                    "status": "simulated",
                    "note": "Actual restore requires manual verification and chain verification"
                }
            },
            steps=self.get_steps()
        )
    
    async def _health_check(self, input_data: Dict[str, Any]) -> BotResult:
        """Run health checks."""
        import psutil
        
        checks = {
            "cpu_ok": psutil.cpu_percent() < 90,
            "memory_ok": psutil.virtual_memory().percent < 90,
            "disk_ok": psutil.disk_usage('/').percent < 90 if os.name != 'nt' else True,
        }
        
        overall_healthy = all(checks.values())
        
        self.log_step("health_check", {
            "healthy": overall_healthy,
            "checks": checks
        })
        
        return BotResult(
            success=True,
            data={
                "health": {
                    "healthy": overall_healthy,
                    "checks": checks,
                    "cpu_percent": psutil.cpu_percent(),
                    "memory_percent": psutil.virtual_memory().percent
                }
            },
            steps=self.get_steps()
        )
    
    async def _get_metrics(self, input_data: Dict[str, Any]) -> BotResult:
        """Get system metrics."""
        import psutil
        
        metrics = {
            "cpu_percent": psutil.cpu_percent(),
            "memory_percent": psutil.virtual_memory().percent,
            "memory_available_mb": psutil.virtual_memory().available / (1024 * 1024),
            "process_count": len(psutil.pids())
        }
        
        self.log_step("get_metrics", metrics)
        
        return BotResult(
            success=True,
            data={"metrics": metrics},
            steps=self.get_steps()
        )
