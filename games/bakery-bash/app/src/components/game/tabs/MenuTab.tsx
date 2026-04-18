import { useState } from "react";
import type { MenuItemId } from "../../../types/game";

interface MenuEntry {
  id: MenuItemId;
  name: string;
  basePrice: number;
  unlocked: boolean;
  station: string;
}

const MENU_ITEMS: MenuEntry[] = [
  { id: "croissant", name: "Croissant", basePrice: 4.75, unlocked: true,  station: "Bakery Station" },
  { id: "cookie",    name: "Cookie",    basePrice: 2.50, unlocked: true,  station: "Bakery Station" },
  { id: "bagel",     name: "Bagel",     basePrice: 3.00, unlocked: true,  station: "Deli" },
  { id: "sandwich",  name: "Sandwich",  basePrice: 8.75, unlocked: false, station: "Deli" },
  { id: "coffee",    name: "Coffee",    basePrice: 4.00, unlocked: false, station: "Barista Station" },
  { id: "matcha",    name: "Matcha",    basePrice: 6.25, unlocked: false, station: "Barista Station" },
];

export function MenuTab() {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const setQty = (id: string, value: number) => {
    setQuantities((prev) => ({ ...prev, [id]: Math.max(0, value) }));
  };

  const totalCost = MENU_ITEMS.reduce((sum, item) => {
    if (!item.unlocked) return sum;
    const qty = quantities[item.id] ?? 0;
    return sum + item.basePrice * qty;
  }, 0);

  return (
    <div className="menu-tab">
      <h3 className="sidebar-tab__title">Menu</h3>
      <p className="sidebar-tab__hint">Set how many of each item to stock.</p>

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
                ${item.basePrice.toFixed(2)}
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
