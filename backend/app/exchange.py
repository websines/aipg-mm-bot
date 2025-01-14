from pyxt.spot import Spot
import logging
import ccxt
import requests
import asyncio

logger = logging.getLogger(__name__)

class Exchange:
    def __init__(self, api_key: str, secret_key: str):
        self.client = Spot(
            host="https://sapi.xt.com",
            access_key=api_key,
            secret_key=secret_key
        )
        # Initialize Coinex client
        self.coinex = ccxt.coinex({
            'enableRateLimit': True
        })
        
        # Xeggex API endpoints
        self.xeggex_base_url = "https://api.xeggex.com/api/v2"
        self.xeggex_market_id = None  # Will be fetched when needed

    async def get_balance(self, asset: str = "usdt"):
        """Get balance for an asset"""
        try:
            logger.info(f"Getting balance for {asset}")
            balance = self.client.balance(asset.lower())
            logger.info(f"Balance response: {balance}")
            return balance
        except Exception as e:
            logger.error(f"Error getting balance: {str(e)}")
            return None

    async def get_market_info(self, symbol: str = "aipg_usdt"):
        """Get market information including price precision"""
        try:
            logger.info(f"Fetching market info for {symbol}")
            # Get symbol config
            try:
                symbol_config = self.client.get_symbol_config(symbol=symbol.lower())
                logger.info(f"Symbol config response: {symbol_config}")
                if symbol_config:
                    # Also get current price
                    try:
                        price = await self.get_market_price(symbol)
                    except Exception as e:
                        logger.error(f"Error getting price for market info: {str(e)}")
                        price = None

                    return {
                        "symbol": symbol.lower(),
                        "status": "trading",
                        "config": symbol_config,
                        "currentPrice": price
                    }
            except Exception as e:
                logger.error(f"Error getting symbol config: {str(e)}")

            # Try to get ticker data
            try:
                logger.info("Getting ticker data")
                ticker = self.client.get_tickers(symbol=symbol.lower())
                logger.info(f"Ticker response: {ticker}")
                if isinstance(ticker, list) and len(ticker) > 0:
                    ticker_data = next((t for t in ticker if t.get('s') == symbol.lower()), None)
                    if ticker_data:
                        return {
                            "symbol": symbol.lower(),
                            "status": "trading",
                            "currentPrice": float(ticker_data['p']) if 'p' in ticker_data else None,
                            "timestamp": ticker_data.get('t')
                        }

            except Exception as e:
                logger.error(f"Error getting ticker: {str(e)}")

            raise Exception("Could not get market info from any endpoint")
        except Exception as e:
            logger.error(f"Error getting market info: {str(e)}")
            raise Exception(f"Failed to get market info: {str(e)}")

    async def get_market_price(self, symbol: str = "aipg_usdt"):
        """Get current market price for a symbol"""
        try:
            logger.info(f"Fetching market price for {symbol}")
            # Get ticker data
            ticker = self.client.get_tickers(symbol=symbol.lower())
            logger.info(f"Ticker response: {ticker}")
            
            if not ticker:
                raise Exception("No ticker data received")

            # The response is a list of ticker objects with 's' (symbol), 't' (timestamp), 'p' (price)
            if isinstance(ticker, list) and len(ticker) > 0:
                for t in ticker:
                    if t.get('s') == symbol.lower() and 'p' in t:
                        try:
                            price = float(t['p'])
                            logger.info(f"Found price: {price}")
                            return price
                        except (ValueError, TypeError) as e:
                            logger.error(f"Error converting price to float: {e}")
                            continue
                
                raise Exception(f"No valid price found for symbol {symbol}")
            else:
                raise Exception(f"Unexpected ticker format: {ticker}")

        except Exception as e:
            logger.error(f"Error getting market price: {str(e)}")
            raise Exception(f"Failed to get market price: {str(e)}")

    async def place_grid_orders(self, symbol: str, price: float, quantity: float, side: str):
        """Place a limit order"""
        try:
            logger.info(f"Placing {side} order for {symbol} at {price} with quantity {quantity}")
            
            # Round price and quantity to appropriate decimals
            price = round(price, 6)  # 6 decimals for price
            quantity = round(quantity, 2)  # 2 decimals for quantity
            
            logger.info(f"Rounded values: price={price}, quantity={quantity}")
            
            response = self.client.order(
                symbol=symbol.lower(),
                price=price,
                quantity=quantity,
                side=side.upper(),
                type='LIMIT'
            )
            logger.info(f"Order response: {response}")
            return response
        except Exception as e:
            logger.error(f"Error placing order: {str(e)}")
            raise Exception(f"Failed to place {side} order: {str(e)}")

    async def get_open_orders(self, symbol: str = "aipg_usdt"):
        """Get all open orders for a symbol"""
        try:
            logger.info(f"Getting open orders for {symbol}")
            orders = self.client.get_open_orders(symbol=symbol.lower())
            logger.info(f"Open orders response: {orders}")
            return orders
        except Exception as e:
            logger.error(f"Error getting open orders: {str(e)}")
            return None

    async def cancel_all_orders(self, symbol: str):
        """Cancel all open orders for a symbol"""
        try:
            logger.info(f"Canceling all orders for {symbol}")
            orders = await self.get_open_orders(symbol)
            if not orders:
                return True

            for order in orders:
                try:
                    self.client.cancel_order(order_id=order['orderId'])
                    logger.info(f"Cancelled order {order['orderId']}")
                except Exception as e:
                    logger.error(f"Error canceling order {order['orderId']}: {str(e)}")

            return True
        except Exception as e:
            logger.error(f"Error canceling all orders: {str(e)}")
            return False

    async def create_grid(self, symbol: str, positions: int, total_amount: float, min_distance: float, max_distance: float, center_price: float = None):
        """Create a grid of buy and sell orders"""
        try:
            logger.info(f"Creating grid for {symbol} with {positions} positions")
            
            # Get current market price or use provided center price
            market_price = await self.get_market_price(symbol)
            if not market_price:
                raise Exception("Failed to get current market price")

            # If center_price is provided, use it for grid calculations
            current_price = center_price if center_price else market_price
            logger.info(f"Market price: {market_price}, Using price for grid: {current_price}")

            # Cancel existing orders
            await self.cancel_all_orders(symbol)

            # Calculate grid parameters
            amount_per_grid = total_amount / positions
            price_step = (max_distance - min_distance) / (positions - 1)

            logger.info(f"Grid parameters: amount_per_grid={amount_per_grid}, price_step={price_step}")

            # Place grid orders
            orders_placed = []
            for i in range(positions):
                try:
                    distance = min_distance + (price_step * i)
                    
                    # Calculate buy and sell prices
                    buy_price = current_price * (1 - distance / 100)
                    sell_price = current_price * (1 + distance / 100)
                    
                    logger.info(f"Grid level {i}: distance={distance}%, buy={buy_price}, sell={sell_price}")
                    
                    # When correcting inflated price, prioritize sell orders
                    if center_price and market_price > center_price:
                        # Place more sell orders to bring price down
                        sell_quantity = (amount_per_grid / sell_price) * 2.0  # Double quantity for sells
                        buy_quantity = (amount_per_grid / buy_price) * 0.5   # Half quantity for buys
                        logger.info(f"Price correction (high): Increasing sell quantity to {sell_quantity}, reducing buy quantity to {buy_quantity}")
                    elif center_price and market_price < center_price:
                        # Place more buy orders to bring price up
                        sell_quantity = (amount_per_grid / sell_price) * 0.5  # Half quantity for sells
                        buy_quantity = (amount_per_grid / buy_price) * 2.0   # Double quantity for buys
                        logger.info(f"Price correction (low): Increasing buy quantity to {buy_quantity}, reducing sell quantity to {sell_quantity}")
                    else:
                        sell_quantity = amount_per_grid / sell_price
                        buy_quantity = amount_per_grid / buy_price
                        logger.info(f"Normal grid: Using equal quantities - buy: {buy_quantity}, sell: {sell_quantity}")
                    
                    # Place buy order
                    buy_order = await self.place_grid_orders(
                        symbol=symbol,
                        price=buy_price,
                        quantity=buy_quantity,
                        side='BUY'
                    )
                    if buy_order:
                        orders_placed.append(buy_order)
                    
                    # Place sell order
                    sell_order = await self.place_grid_orders(
                        symbol=symbol,
                        price=sell_price,
                        quantity=sell_quantity,
                        side='SELL'
                    )
                    if sell_order:
                        orders_placed.append(sell_order)
                        
                except Exception as e:
                    logger.error(f"Error placing grid orders at level {i}: {str(e)}")
                    continue

            logger.info(f"Successfully placed {len(orders_placed)} orders")
            return orders_placed
            
        except Exception as e:
            logger.error(f"Error creating grid: {str(e)}")
            raise Exception(f"Grid creation failed: {str(e)}")

    async def get_xeggex_market_id(self):
        """Get Xeggex market ID for AIPG/USDT"""
        if self.xeggex_market_id:
            return self.xeggex_market_id
            
        try:
            # Get all markets
            response = requests.get(f"{self.xeggex_base_url}/markets")
            logger.info("Fetching Xeggex markets list")
            
            if response.status_code == 200:
                markets = response.json()
                # Find AIPG/USDT market
                for market in markets:
                    if market.get('symbol') == 'AIPG/USDT':
                        self.xeggex_market_id = market.get('id')
                        logger.info(f"Found Xeggex market ID: {self.xeggex_market_id}")
                        return self.xeggex_market_id
                logger.error("AIPG/USDT market not found on Xeggex")
            else:
                logger.error(f"Failed to get Xeggex markets: {response.status_code} - {response.text}")
        except Exception as e:
            logger.error(f"Error getting Xeggex market ID: {str(e)}")
        return None

    async def get_other_exchange_prices(self, symbol: str = "aipg_usdt"):
        """Get prices from other exchanges (Xeggex and Coinex)"""
        try:
            logger.info(f"Getting prices from other exchanges for {symbol}")
            prices = {}
            
            # Get Xeggex price
            try:
                # Use direct symbol endpoint
                xeggex_response = requests.get(f"{self.xeggex_base_url}/market/getbysymbol/AIPG%2FUSDT")
                logger.info(f"Xeggex response: {xeggex_response.text}")
                
                if xeggex_response.status_code == 200:
                    xeggex_data = xeggex_response.json()
                    if 'lastPrice' in xeggex_data:
                        try:
                            prices['xeggex'] = float(xeggex_data['lastPrice'])
                            # Store full response for bid/ask access
                            prices['xeggex_data'] = xeggex_data
                            logger.info(f"Xeggex price: {prices['xeggex']}")
                            
                            # Also log bid/ask for reference
                            if 'bestBid' in xeggex_data and 'bestAsk' in xeggex_data:
                                logger.info(f"Xeggex bid/ask: {xeggex_data['bestBid']}/{xeggex_data['bestAsk']}")
                        except (ValueError, TypeError) as e:
                            logger.error(f"Error converting Xeggex price: {e}")
                    else:
                        logger.error(f"No lastPrice in Xeggex response: {xeggex_data}")
                else:
                    logger.error(f"Xeggex API error: {xeggex_response.status_code} - {xeggex_response.text}")
            except Exception as e:
                logger.error(f"Error getting Xeggex price: {str(e)}")
            
            # Get Coinex price
            try:
                coinex_ticker = self.coinex.fetch_ticker("AIPG/USDT")
                if coinex_ticker and 'last' in coinex_ticker:
                    prices['coinex'] = float(coinex_ticker['last'])
                    logger.info(f"Coinex price: {prices['coinex']}")
                else:
                    logger.error(f"Invalid Coinex response: {coinex_ticker}")
            except Exception as e:
                logger.error(f"Error getting Coinex price: {str(e)}")
            
            if prices:
                logger.info(f"Other exchange prices: {prices}")
                return prices
            else:
                logger.error("No prices retrieved from any exchange")
                return None
                
        except Exception as e:
            logger.error(f"Error getting other exchange prices: {str(e)}")
            return None

    async def should_adjust_grid(self, symbol: str = "aipg_usdt", threshold: float = 0.02):
        """Check if grid needs adjustment based on price difference with other exchanges"""
        try:
            # Get XT price
            xt_price = await self.get_market_price(symbol)
            if not xt_price:
                return False, None
                
            # Get other exchange prices
            other_prices = await self.get_other_exchange_prices(symbol)
            if not other_prices:
                return False, None
                
            # Calculate average price from other exchanges
            valid_prices = []
            if 'xeggex' in other_prices:
                valid_prices.append(other_prices['xeggex'])
            if 'coinex' in other_prices:
                valid_prices.append(other_prices['coinex'])
                
            if not valid_prices:
                return False, None
                
            target_price = sum(valid_prices) / len(valid_prices)
            
            # Calculate price difference
            price_diff = abs(xt_price - target_price) / target_price
            
            logger.info(f"Price comparison - XT: {xt_price}, Target: {target_price}, Difference: {price_diff:.2%}")
            
            # Always return True and target price if XT price is significantly different
            if price_diff > threshold:
                logger.info(f"Price correction needed - XT price is {'higher' if xt_price > target_price else 'lower'} than target")
                return True, target_price
            
            return False, None
            
        except Exception as e:
            logger.error(f"Error checking grid adjustment: {str(e)}")
            return False, None
