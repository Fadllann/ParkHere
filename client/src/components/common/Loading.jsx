const Loading = ({ fullScreen = false, text = 'Memuat...' }) => {
    if (fullScreen) {
        return (
            <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="text-center ph-card px-10 py-8 rounded-2xl">
                    <div className="spinner mx-auto mb-4"></div>
                    <p className="text-slate-700 font-medium text-sm">{text}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center py-12">
            <div className="text-center">
                <div className="spinner mx-auto mb-4"></div>
                <p className="text-gray-600">{text}</p>
            </div>
        </div>
    );
};

export default Loading;
