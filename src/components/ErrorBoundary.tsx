/**
 * @file Page.tsx
 * @class ErrorBoundary
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 * 
 * @description
 * React class component that catches JavaScript errors anywhere in its child component tree,
 * logs the error using the application's logger, and displays a fallback UI.
 *
 * Usage example:
 * ```tsx
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 *
 * Errors are caught in:
 * - Rendering
 * - Lifecycle methods
 * - Constructors of child components
 *
 * The error details are logged via `logger` for diagnostics.
 */
import React, { Component, ReactNode } from "react";
import Dialog from "./ui/Dialog";
import logger from "../logger.service";


/**
 * Props for the `ErrorBoundary` component.
 *
 * @property {ReactNode} children - The child elements to be wrapped by the error boundary.
 */
type Props = { children: ReactNode };

/**
 * Internal state for the `ErrorBoundary` component.
 *
 * @property {boolean} hasError - Whether an error has been caught.
 * @property {Error} [error] - The error instance that was caught, if any.
 */
type State = { hasError: boolean; error?: Error };

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error("Error caught in ErrorBoundary:", error, errorInfo);
  }

  private handleClose = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    const { hasError, error } = this.state;

    if (hasError && error) {
      return (
        <Dialog
          error={{
            header: "Error",
            message: `An unrecoverable error has occurred. We do apologize for the inconvenience, please try the action again. If the error persists please contact your administrator. Error Message: ${error.message || "An unexpected error occurred"}`,
            errorType: "error",
          }}
          showCloseButton={false}
          showActionButton={true}
          buttonLabel="Close"
          onButtonClick={this.handleClose}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

