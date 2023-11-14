import { NonIdealState } from "@blueprintjs/core";
import { IconNames } from "@blueprintjs/icons";
import React from "react";

export const Top: React.FC = () => {
  return (
    <div className="pt-16 h-screen flex-1">
      <NonIdealState icon={IconNames.BUILD} />
    </div>
  );
};
