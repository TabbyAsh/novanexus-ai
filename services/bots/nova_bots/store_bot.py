"""
StoreBot - E-commerce operations simulation.

Features:
- Product/supplier management
- Margin calculation
- Listing state machine (draft → review → listed)
- Order simulation (placed → paid → shipped → delivered)
"""
from typing import Any, Dict, List
from nova_bots.base import BaseBot, BotResult


class StoreBot(BaseBot):
    """Store bot for e-commerce operations."""
    
    # Sample products
    SAMPLE_PRODUCTS = [
        {"id": "prod-001", "name": "Widget A", "cost": "10.00", "price": "19.99", "status": "listed"},
        {"id": "prod-002", "name": "Widget B", "cost": "15.00", "price": "29.99", "status": "draft"},
        {"id": "prod-003", "name": "Gadget X", "cost": "25.00", "price": "49.99", "status": "review"},
    ]
    
    async def execute(self, action: str, input_data: Dict[str, Any]) -> BotResult:
        """Execute a store bot action."""
        self.reset_steps()
        
        try:
            if action == "list_products":
                return await self._list_products(input_data)
            elif action == "calculate_margin":
                return await self._calculate_margin(input_data)
            elif action == "update_status":
                return await self._update_status(input_data)
            elif action == "simulate_order":
                return await self._simulate_order(input_data)
            elif action == "export":
                return await self._export(input_data)
            else:
                return BotResult(success=False, data={}, error=f"Unknown action: {action}")
        except Exception as e:
            return BotResult(success=False, data={}, error=str(e), steps=self.get_steps())
    
    async def _list_products(self, input_data: Dict[str, Any]) -> BotResult:
        """List all products."""
        self.log_step("list_products", {"count": len(self.SAMPLE_PRODUCTS)})
        return BotResult(
            success=True,
            data={"products": self.SAMPLE_PRODUCTS},
            steps=self.get_steps()
        )
    
    async def _calculate_margin(self, input_data: Dict[str, Any]) -> BotResult:
        """Calculate margin for a product."""
        cost = float(input_data.get("cost", "10"))
        price = float(input_data.get("price", "20"))
        
        margin = ((price - cost) / price) * 100
        profit = price - cost
        
        self.log_step("calculate_margin", {
            "cost": self._decimal_str(cost),
            "price": self._decimal_str(price),
            "margin_pct": self._decimal_str(margin),
            "profit": self._decimal_str(profit)
        })
        
        return BotResult(
            success=True,
            data={
                "margin": {
                    "cost": self._decimal_str(cost),
                    "price": self._decimal_str(price),
                    "margin_pct": self._decimal_str(margin),
                    "profit": self._decimal_str(profit)
                }
            },
            steps=self.get_steps()
        )
    
    async def _update_status(self, input_data: Dict[str, Any]) -> BotResult:
        """Update product status (state machine)."""
        product_id = input_data.get("product_id", "prod-001")
        new_status = input_data.get("status", "review")
        
        # Valid transitions
        valid_transitions = {
            "draft": ["review"],
            "review": ["draft", "listed"],
            "listed": ["draft"]
        }
        
        self.log_step("update_status", {
            "product_id": product_id,
            "new_status": new_status,
            "simulated": True
        })
        
        return BotResult(
            success=True,
            data={"product_id": product_id, "status": new_status},
            steps=self.get_steps()
        )
    
    async def _simulate_order(self, input_data: Dict[str, Any]) -> BotResult:
        """Simulate an order through its lifecycle."""
        product_id = input_data.get("product_id", "prod-001")
        quantity = int(input_data.get("quantity", 1))
        
        # Simulate order states
        states = ["placed", "paid", "shipped", "delivered"]
        
        for state in states:
            self.log_step(f"order_{state}", {
                "product_id": product_id,
                "quantity": quantity,
                "simulated": True
            })
        
        order_id = f"order-{self.random.randint(1000, 9999)}"
        
        return BotResult(
            success=True,
            data={
                "order": {
                    "id": order_id,
                    "product_id": product_id,
                    "quantity": quantity,
                    "status": "delivered",
                    "simulated": True
                }
            },
            steps=self.get_steps()
        )
    
    async def _export(self, input_data: Dict[str, Any]) -> BotResult:
        """Export products."""
        self.log_step("export", {"format": "json"})
        return BotResult(
            success=True,
            data={"export": self.SAMPLE_PRODUCTS, "format": "json"},
            steps=self.get_steps()
        )
