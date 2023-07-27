import React, { ComponentType, MouseEventHandler } from "react";

import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

type IconButtonProps = {
  type?: "primary" | "secondary" | "tertiary";
  onClick?: MouseEventHandler<HTMLButtonElement>;
  tooltip?: string;
  icon?: ComponentType;
  className?: string;
  disabled?: boolean;
};

const baseClasses =
  "s-transition-all s-ease-out s-duration-300 s-cursor-pointer hover:s-scale-110";

const iconClasses = {
  primary: {
    base: "s-text-action-500",
    hover: "hover:s-text-action-400",
    active: "active:s-text-action-600",
    disabled: "s-text-element-500",
    dark: {
      base: "dark:s-text-action-500-dark",
      hover: "dark:hover:s-text-action-500-dark",
      active: "dark:active:s-text-action-600-dark",
      disabled: "dark:s-text-element-500-dark",
    },
  },
  secondary: {
    base: "s-text-element-900",
    hover: "hover:s-text-action-400",
    active: "active:s-text-action-600",
    disabled: "s-text-element-500",
    dark: {
      base: "dark:s-text-element-900-dark",
      hover: "dark:hover:s-text-action-500-dark",
      active: "dark:active:s-text-action-600-dark",
      disabled: "dark:s-text-element-500-dark",
    },
  },
  tertiary: {
    base: "s-text-element-600",
    hover: "hover:s-text-action-400",
    active: "active:s-text-action-600",
    disabled: "s-text-element-500",
    dark: {
      base: "dark:s-text-element-600-dark",
      hover: "dark:hover:s-text-action-500-dark",
      active: "dark:active:s-text-action-600-dark",
      disabled: "dark:s-text-element-500-dark",
    },
  },
};

export function IconButton({
  type = "tertiary",
  onClick,
  disabled = false,
  tooltip,
  icon,
  className = "",
}: IconButtonProps) {
  // Choose the correct group of classes based on 'type'
  const iconGroup = iconClasses[type];

  const finalIconClasses = classNames(
    className,
    baseClasses,
    iconGroup.base,
    disabled ? iconGroup.disabled : iconGroup.hover,
    disabled ? "" : iconGroup.active,
    iconGroup.dark.base,
    disabled ? iconGroup.dark.disabled : iconGroup.dark.hover,
    disabled ? "" : iconGroup.dark.active
  );

  const IconButtonContent = (
    <button
      className={finalIconClasses}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {icon && <Icon IconComponent={icon} className="s-h-5 s-w-5" />}
    </button>
  );

  return tooltip ? (
    <Tooltip label={tooltip}>{IconButtonContent}</Tooltip>
  ) : (
    IconButtonContent
  );
}