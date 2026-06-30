// TopBar Component - Header with model selector
(function() {
  const { ModelInterface } = window.Quantum.Components;

  function TopBar({
    models,
    modelVal,
    setModelVal,
    panelOpen,
    setPanelOpen,
    onReset,
    status,
    theme,
    setTheme,
  }) {
    return (
      <header className="topbar">
        <ModelInterface
          models={models}
          modelVal={modelVal}
          setModelVal={setModelVal}
        />
        <div className="tb-spacer" />
      </header>
    );
  }

  // Export to global namespace
  window.Quantum.Components.TopBar = TopBar;
})();
