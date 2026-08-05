import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', backgroundColor: '#f8d7da', color: '#721c24', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>React Application Runtime Crash</h1>
          <hr style={{ borderColor: '#f5c6cb', margin: '20px 0' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>{this.state.error && this.state.error.toString()}</h2>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: '20px', backgroundColor: '#f5c6cb', padding: '15px', borderRadius: '5px' }}>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
