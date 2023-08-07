export type TreeBlueprintNamespace = Map<string, TreeBlueprintNode>;
export type TreeBlueprintNode =
  | { type: "leaf"; key: string }
  | { type: "ns"; ns: TreeBlueprintNamespace };
export const digTreeBlueprintNamespace = (
  ns: TreeBlueprintNamespace,
  path: string[],
): TreeBlueprintNamespace => {
  if (path.length === 0) {
    return ns;
  }
  const [pathHead, ...pathTail] = path;
  const childNs = (() => {
    if (ns.has(pathHead)) {
      const node = ns.get(pathHead)!;
      switch (node.type) {
        case "ns":
          return node.ns;
        case "leaf": {
          const childNs: TreeBlueprintNamespace = new Map();
          childNs.set("", node);
          ns.set(pathHead, { type: "ns", ns: childNs });
          return childNs;
        }
      }
    } else {
      const childNs: TreeBlueprintNamespace = new Map();
      ns.set(pathHead, { type: "ns", ns: childNs });
      return childNs;
    }
  })();
  return digTreeBlueprintNamespace(childNs, pathTail);
};

export type TreeNamespace<T> = Map<string, TreeNode<T>>;
export type TreeNode<T> =
  | { type: "leaf"; value: T }
  | { type: "ns"; ns: TreeNamespace<T> };

export const buildTree = <T>(
  blueprint: TreeBlueprintNamespace,
  getValue: (key: string) => T,
): TreeNamespace<T> => {
  const map = new Map();
  for (const [key, value] of blueprint) {
    switch (value.type) {
      case "leaf":
        map.set(key, { type: "leaf", value: getValue(value.key) });
        break;
      case "ns":
        map.set(key, { type: "ns", ns: buildTree(value.ns, getValue) });
        break;
    }
  }
  return map;
};
