import React from "react";

import {
   useFloating,
   autoUpdate,
   offset,
   flip,
   shift,
   useHover,
   useFocus,
   useDismiss,
   useRole,
   useInteractions,
   FloatingPortal,
   useDelayGroup,
   useDelayGroupContext,
   useMergeRefs,
   useId,
   useTransitionStyles,
} from "@floating-ui/react";
import type { Placement } from "@floating-ui/react";

interface TooltipOptions {
   initialOpen?: boolean;
   placement?: Placement;
   open?: boolean;
   setDelay?: number;
   onOpenChange?: (open: boolean) => void;
}

export function useTooltip({
   initialOpen = false,
   placement = "top",
   setDelay = 0,
   open: controlledOpen,
   onOpenChange: setControlledOpen,
}: TooltipOptions = {}) {
   const [uncontrolledOpen, setUncontrolledOpen] = React.useState(initialOpen);

   const open = controlledOpen ?? uncontrolledOpen;
   const setOpen = setControlledOpen ?? setUncontrolledOpen;

   const { delay: delayGroup } = useDelayGroupContext();

   const data = useFloating({
      placement,
      open,
      onOpenChange: setOpen,
      whileElementsMounted: autoUpdate,
      middleware: [offset(5), flip(), shift()],
   });

   const context = data.context;

   const hover = useHover(context, {
      move: false,
      enabled: controlledOpen == null,
      delay: delayGroup != 0 ? delayGroup : setDelay,
   });
   const focus = useFocus(context, {
      enabled: controlledOpen == null,
   });
   const dismiss = useDismiss(context);
   const role = useRole(context, { role: "tooltip" });

   const interactions = useInteractions([hover, focus, dismiss, role]);

   return React.useMemo(
      () => ({
         open,
         setOpen,
         ...interactions,
         ...data,
      }),
      [open, setOpen, interactions, data],
   );
}

type ContextType = ReturnType<typeof useTooltip> | null;

const TooltipContext = React.createContext<ContextType>(null);

export const useTooltipState = () => {
   const context = React.useContext(TooltipContext);

   if (context == null) {
      throw new Error("Tooltip components must be wrapped in <Tooltip />");
   }

   return context;
};

export function Tooltip({
   children,
   ...options
}: { children: React.ReactNode } & TooltipOptions) {
   // This can accept any props as options, e.g. `placement`,
   // or other positioning options.
   const tooltip = useTooltip(options);
   return (
      <TooltipContext.Provider value={tooltip}>
         {children}
      </TooltipContext.Provider>
   );
}

export const TooltipTrigger = React.forwardRef<
   HTMLElement,
   React.HTMLProps<HTMLElement> & { asChild?: boolean }
>(function TooltipTrigger({ children, asChild = false, ...props }, propRef) {
   const state = useTooltipState();

   const childrenRef = (children as any).ref;
   const ref = useMergeRefs([state.refs.setReference, propRef, childrenRef]);

   // `asChild` allows the user to pass any element as the anchor
   if (asChild && React.isValidElement(children)) {
      return React.cloneElement(
         children,
         state.getReferenceProps({
            ref,
            ...props,
            ...children.props,
            "data-state": state.open ? "open" : "closed",
         }),
      );
   }

   return (
      <button
         ref={ref}
         // The user can style the trigger based on the state
         data-state={state.open ? "open" : "closed"}
         {...state.getReferenceProps(props)}
      >
         {children}
      </button>
   );
});

export const TooltipContent = React.forwardRef<
   HTMLDivElement,
   React.HTMLProps<HTMLDivElement>
>(function TooltipContent(props, propRef) {
   const state = useTooltipState();
   const id = useId();
   const { isInstantPhase, currentId } = useDelayGroupContext();
   const ref = useMergeRefs([state.refs.setFloating, propRef]);

   useDelayGroup(state.context, { id });

   const instantDuration = 0;
   const duration = 250;

   const { isMounted, styles } = useTransitionStyles(state.context, {
      duration: isInstantPhase
         ? {
              open: instantDuration,
              // `id` is this component's `id`
              // `currentId` is the current group's `id`
              close: currentId === id ? duration : instantDuration,
           }
         : duration,
      initial: {
         opacity: 0,
      },
   });

   if (!isMounted) return null;

   return (
      <FloatingPortal>
         <div
            className="dark:bg-dark400 relative z-50 rounded-md border bg-white px-2 py-1 text-[10px] font-bold shadow dark:border-zinc-700 dark:shadow-zinc-800"
            ref={ref}
            style={{
               ...state.floatingStyles,
               ...props.style,
               ...styles,
            }}
            {...state.getFloatingProps(props)}
         />
      </FloatingPortal>
   );
});
