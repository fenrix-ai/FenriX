import { useState } from "react";
import { useGame } from "../../../contexts/GameContext";

interface MenuEntry {
  id: string;
  name: string;
  basePrice: number;
  unlocked: boolean;
}

const MENU_ITEMS: MenuEntry[] = [
  { id: "croissant", name: "Croissant", basePrice: 3.5, unlocked: true },
  { id: "cookie", name: "Cookie", basePrice: 2.0, unlocked: true },
  { id: "bagel", name: "Bagel", basePrice: 4.0, unlocked: true },
  { id: "sandwich", name: "Sandwich", basePrice: 7.0, unlocked: false },
  { id: "latte", name: "Latte", basePrice: 5.0, unlocked: false },
  { id: "matcha-latte", name: "Matcha Latte", basePrice: 6.0, unlocked: false },
];

export function MenuTab() {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const { config } = useGame();

  const unitCost = config?.unitCostPerProduct ?? 1;

  const setQty = (id: string, value: number) => {
    setQuantities((prev) => ({ ...prev, [id]: Math.max(0, value) }));
  };

  const totalCost = MENU_ITEMS.reduce((sum, item) => {
    if (!item.unlocked) return sum;
    const qty = quantities[item.id] ?? 0;
    return sum + qty * unitCost;
  }, 0);

  return (
    <div className="menu-tab">
      <h3 className="sidebar-tab__title">Menu</h3>
      <p className="sidebar-tab__hint">Set how many of each item to stock. Stock cost: ${unitCost}/unit.</p>

      <div className="menu-tab__list">
        {MENU_ITEMS.map((item) => (
          <div
            key={item.id}
            className={`menu-tab__item ${
              !item.unlocked ? "menu-tab__item--locked" : ""
            }`}
          >
            <div className="menu-tab__item-info">
              <span className="menu-tab__item-name">{item.name}</span>
              <span className="menu-tab__item-price">
                ${item.basePrice.toFixed(2)} retail
              </span>
            </div>
            {item.unlocked ? (
              <input
                type="number"
                className="menu-tab__qty-input"
                placeholder="0"
                min={0}
                step={1}
                value={quantities[item.id] ?? ""}
                onChange={(e) =>
                  setQty(item.id, parseInt(e.target.value) || 0)
                }
              />
            ) : (
              <span className="menu-tab__locked-badge">Locked</span>
            )}
          </div>
        ))}
      </div>

      <div className="menu-tab__total">
        Stock Cost: <strong>${totalCost.toFixed(2)}</strong>
      </div>
    </div>
  );
}
