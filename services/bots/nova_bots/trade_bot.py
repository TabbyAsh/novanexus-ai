"""
TradeBot - Trading analysis and paper trading simulation.

Features:
- OHLCV data processing
- Technical indicators: RSI, ADX/DMI, VWAP
- Trading thesis with checklist/scoring
- Paper trade simulation
- Backtest metrics
- Export results
"""
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from decimal import Decimal
import math

from nova_bots.base import BaseBot, BotResult


@dataclass
class OHLCV:
    """OHLCV candle data."""
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class Signal:
    """Trading signal."""
    symbol: str
    side: str  # buy/sell
    strength: float  # 0-1
    thesis: Dict[str, Any]
    checklist: Dict[str, bool]
    score: float


class TradeBot(BaseBot):
    """
    Trading bot with technical analysis and paper trading.
    
    Actions:
    - analyze: Analyze a symbol and generate signals
    - paper_trade: Execute a paper trade
    - backtest: Run backtest on historical data
    - export: Export analysis/trades to CSV/JSON
    """
    
    # Sample OHLCV data for demo (deterministic)
    SAMPLE_DATA = [
        OHLCV("2024-01-01T00:00:00Z", 100.0, 102.0, 99.0, 101.5, 1000000),
        OHLCV("2024-01-02T00:00:00Z", 101.5, 103.0, 100.5, 102.8, 1200000),
        OHLCV("2024-01-03T00:00:00Z", 102.8, 104.5, 102.0, 103.2, 1100000),
        OHLCV("2024-01-04T00:00:00Z", 103.2, 103.8, 101.0, 101.8, 1300000),
        OHLCV("2024-01-05T00:00:00Z", 101.8, 102.5, 100.0, 100.5, 1400000),
        OHLCV("2024-01-06T00:00:00Z", 100.5, 101.0, 98.0, 99.2, 1600000),
        OHLCV("2024-01-07T00:00:00Z", 99.2, 100.5, 98.5, 100.0, 1500000),
        OHLCV("2024-01-08T00:00:00Z", 100.0, 102.0, 99.5, 101.5, 1300000),
        OHLCV("2024-01-09T00:00:00Z", 101.5, 103.5, 101.0, 103.0, 1200000),
        OHLCV("2024-01-10T00:00:00Z", 103.0, 105.0, 102.5, 104.5, 1400000),
        OHLCV("2024-01-11T00:00:00Z", 104.5, 106.0, 104.0, 105.2, 1500000),
        OHLCV("2024-01-12T00:00:00Z", 105.2, 107.0, 104.5, 106.8, 1600000),
        OHLCV("2024-01-13T00:00:00Z", 106.8, 108.0, 106.0, 107.5, 1700000),
        OHLCV("2024-01-14T00:00:00Z", 107.5, 108.5, 106.5, 106.0, 1800000),
    ]
    
    async def execute(self, action: str, input_data: Dict[str, Any]) -> BotResult:
        """Execute a trading bot action."""
        self.reset_steps()
        
        try:
            if action == "analyze":
                return await self._analyze(input_data)
            elif action == "paper_trade":
                return await self._paper_trade(input_data)
            elif action == "backtest":
                return await self._backtest(input_data)
            elif action == "export":
                return await self._export(input_data)
            else:
                return BotResult(
                    success=False,
                    data={},
                    error=f"Unknown action: {action}"
                )
        except Exception as e:
            return BotResult(
                success=False,
                data={},
                error=str(e),
                steps=self.get_steps()
            )
    
    async def _analyze(self, input_data: Dict[str, Any]) -> BotResult:
        """Analyze a symbol and generate trading signal."""
        symbol = input_data.get("symbol", "DEMO")
        data = self.SAMPLE_DATA  # Use sample data for demo
        
        self.log_step("load_data", {"symbol": symbol, "candles": len(data)})
        
        # Calculate indicators
        closes = [c.close for c in data]
        
        rsi = self._calculate_rsi(closes)
        self.log_step("calculate_rsi", {"value": self._decimal_str(rsi)})
        
        adx, plus_di, minus_di = self._calculate_adx(data)
        self.log_step("calculate_adx", {
            "adx": self._decimal_str(adx),
            "plus_di": self._decimal_str(plus_di),
            "minus_di": self._decimal_str(minus_di)
        })
        
        vwap = self._calculate_vwap(data)
        self.log_step("calculate_vwap", {"value": self._decimal_str(vwap)})
        
        # Build checklist
        current_price = closes[-1]
        checklist = {
            "rsi_not_overbought": rsi < 70,
            "rsi_not_oversold": rsi > 30,
            "adx_trending": adx > 25,
            "price_above_vwap": current_price > vwap,
            "uptrend": plus_di > minus_di,
        }
        
        # Calculate score
        score = sum(checklist.values()) / len(checklist)
        
        # Determine signal
        if score >= 0.6 and checklist["uptrend"]:
            side = "buy"
            strength = min(score, 0.8)
        elif score < 0.4 and not checklist["uptrend"]:
            side = "sell"
            strength = min(1 - score, 0.8)
        else:
            side = "hold"
            strength = 0.5
        
        thesis = {
            "symbol": symbol,
            "current_price": self._decimal_str(current_price),
            "indicators": {
                "rsi": self._decimal_str(rsi),
                "adx": self._decimal_str(adx),
                "vwap": self._decimal_str(vwap),
                "trend": "bullish" if plus_di > minus_di else "bearish"
            },
            "reasoning": f"RSI at {rsi:.1f}, ADX at {adx:.1f} indicates {'strong' if adx > 25 else 'weak'} trend"
        }
        
        signal = Signal(
            symbol=symbol,
            side=side,
            strength=strength,
            thesis=thesis,
            checklist=checklist,
            score=score
        )
        
        self.log_step("generate_signal", {
            "side": side,
            "strength": self._decimal_str(strength),
            "score": self._decimal_str(score)
        })
        
        return BotResult(
            success=True,
            data={
                "signal": {
                    "symbol": signal.symbol,
                    "side": signal.side,
                    "strength": self._decimal_str(signal.strength),
                    "thesis": signal.thesis,
                    "checklist": signal.checklist,
                    "score": self._decimal_str(signal.score)
                }
            },
            steps=self.get_steps()
        )
    
    async def _paper_trade(self, input_data: Dict[str, Any]) -> BotResult:
        """Execute a paper trade (simulation)."""
        symbol = input_data.get("symbol", "DEMO")
        side = input_data.get("side", "buy")
        quantity = float(input_data.get("quantity", "1"))
        
        # Simulate execution with slight slippage
        base_price = self.SAMPLE_DATA[-1].close
        slippage = self.random.uniform(-0.001, 0.001)
        fill_price = base_price * (1 + slippage)
        
        self.log_step("execute_paper_trade", {
            "symbol": symbol,
            "side": side,
            "quantity": self._decimal_str(quantity),
            "fill_price": self._decimal_str(fill_price),
            "slippage_pct": self._decimal_str(slippage * 100, 4)
        })
        
        return BotResult(
            success=True,
            data={
                "trade": {
                    "symbol": symbol,
                    "side": side,
                    "quantity": self._decimal_str(quantity),
                    "fill_price": self._decimal_str(fill_price),
                    "total_value": self._decimal_str(quantity * fill_price),
                    "simulated": True
                }
            },
            steps=self.get_steps()
        )
    
    async def _backtest(self, input_data: Dict[str, Any]) -> BotResult:
        """Run backtest simulation."""
        symbol = input_data.get("symbol", "DEMO")
        initial_capital = float(input_data.get("initial_capital", "10000"))
        
        data = self.SAMPLE_DATA
        capital = initial_capital
        position = 0
        trades = []
        
        self.log_step("start_backtest", {
            "symbol": symbol,
            "initial_capital": self._decimal_str(initial_capital),
            "candles": len(data)
        })
        
        # Simple moving average crossover strategy
        for i in range(5, len(data)):
            closes = [c.close for c in data[:i+1]]
            sma_fast = sum(closes[-3:]) / 3
            sma_slow = sum(closes[-5:]) / 5
            
            current_price = data[i].close
            
            if sma_fast > sma_slow and position == 0:
                # Buy signal
                quantity = capital / current_price
                position = quantity
                capital = 0
                trades.append({
                    "type": "buy",
                    "price": self._decimal_str(current_price),
                    "quantity": self._decimal_str(quantity),
                    "timestamp": data[i].timestamp
                })
            elif sma_fast < sma_slow and position > 0:
                # Sell signal
                capital = position * current_price
                trades.append({
                    "type": "sell",
                    "price": self._decimal_str(current_price),
                    "quantity": self._decimal_str(position),
                    "timestamp": data[i].timestamp
                })
                position = 0
        
        # Calculate final value
        final_price = data[-1].close
        final_value = capital + (position * final_price)
        pnl = final_value - initial_capital
        pnl_pct = (pnl / initial_capital) * 100
        
        self.log_step("complete_backtest", {
            "final_value": self._decimal_str(final_value),
            "pnl": self._decimal_str(pnl),
            "pnl_pct": self._decimal_str(pnl_pct),
            "total_trades": len(trades)
        })
        
        return BotResult(
            success=True,
            data={
                "backtest": {
                    "symbol": symbol,
                    "initial_capital": self._decimal_str(initial_capital),
                    "final_value": self._decimal_str(final_value),
                    "pnl": self._decimal_str(pnl),
                    "pnl_pct": self._decimal_str(pnl_pct),
                    "total_trades": len(trades),
                    "trades": trades
                }
            },
            steps=self.get_steps()
        )
    
    async def _export(self, input_data: Dict[str, Any]) -> BotResult:
        """Export data to JSON format."""
        export_type = input_data.get("type", "analysis")
        
        self.log_step("export", {"type": export_type})
        
        if export_type == "sample_data":
            data = [
                {
                    "timestamp": c.timestamp,
                    "open": self._decimal_str(c.open),
                    "high": self._decimal_str(c.high),
                    "low": self._decimal_str(c.low),
                    "close": self._decimal_str(c.close),
                    "volume": str(int(c.volume))
                }
                for c in self.SAMPLE_DATA
            ]
            return BotResult(
                success=True,
                data={"export": data, "format": "json"},
                steps=self.get_steps()
            )
        
        return BotResult(
            success=True,
            data={"export": [], "format": "json"},
            steps=self.get_steps()
        )
    
    def _calculate_rsi(self, closes: List[float], period: int = 14) -> float:
        """Calculate RSI indicator."""
        if len(closes) < period + 1:
            period = max(len(closes) - 1, 2)
        
        deltas = [closes[i] - closes[i-1] for i in range(1, len(closes))]
        
        gains = [d if d > 0 else 0 for d in deltas[-period:]]
        losses = [-d if d < 0 else 0 for d in deltas[-period:]]
        
        avg_gain = sum(gains) / period
        avg_loss = sum(losses) / period
        
        if avg_loss == 0:
            return 100.0
        
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        
        return rsi
    
    def _calculate_adx(self, data: List[OHLCV], period: int = 14) -> tuple:
        """Calculate ADX, +DI, -DI indicators."""
        if len(data) < period + 1:
            period = max(len(data) - 1, 2)
        
        tr_list = []
        plus_dm_list = []
        minus_dm_list = []
        
        for i in range(1, len(data)):
            high = data[i].high
            low = data[i].low
            close_prev = data[i-1].close
            high_prev = data[i-1].high
            low_prev = data[i-1].low
            
            tr = max(high - low, abs(high - close_prev), abs(low - close_prev))
            tr_list.append(tr)
            
            plus_dm = max(high - high_prev, 0) if (high - high_prev) > (low_prev - low) else 0
            minus_dm = max(low_prev - low, 0) if (low_prev - low) > (high - high_prev) else 0
            
            plus_dm_list.append(plus_dm)
            minus_dm_list.append(minus_dm)
        
        # Simple averages for demo
        atr = sum(tr_list[-period:]) / period
        plus_di = (sum(plus_dm_list[-period:]) / period) / atr * 100 if atr > 0 else 0
        minus_di = (sum(minus_dm_list[-period:]) / period) / atr * 100 if atr > 0 else 0
        
        dx = abs(plus_di - minus_di) / (plus_di + minus_di) * 100 if (plus_di + minus_di) > 0 else 0
        adx = dx  # Simplified for demo
        
        return adx, plus_di, minus_di
    
    def _calculate_vwap(self, data: List[OHLCV]) -> float:
        """Calculate VWAP."""
        total_pv = sum((c.high + c.low + c.close) / 3 * c.volume for c in data)
        total_volume = sum(c.volume for c in data)
        
        return total_pv / total_volume if total_volume > 0 else 0
