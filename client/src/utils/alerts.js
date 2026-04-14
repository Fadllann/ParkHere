import Swal from 'sweetalert2';

// Toast configuration
const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
});

export const showSuccess = (message, title = 'Berhasil!') => {
    return Toast.fire({
        icon: 'success',
        title: title,
        text: message
    });
};

export const showError = (message, title = 'Error!') => {
    return Swal.fire({
        icon: 'error',
        title: title,
        text: message,
        confirmButtonColor: '#1e3a5f'
    });
};

export const showWarning = (message, title = 'Peringatan!') => {
    return Swal.fire({
        icon: 'warning',
        title: title,
        text: message,
        confirmButtonColor: '#1e3a5f'
    });
};

export const showInfo = (message, title = 'Info') => {
    return Toast.fire({
        icon: 'info',
        title: title,
        text: message
    });
};

export const showConfirm = (message, title = 'Konfirmasi', confirmText = 'Ya', cancelText = 'Batal') => {
    return Swal.fire({
        icon: 'question',
        title: title,
        text: message,
        showCancelButton: true,
        confirmButtonColor: '#1e3a5f',
        cancelButtonColor: '#6b7280',
        confirmButtonText: confirmText,
        cancelButtonText: cancelText
    });
};

export const showLoading = (message = 'Memproses...') => {
    return Swal.fire({
        title: message,
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
};

export const closeLoading = () => {
    Swal.close();
};

export const showTicketSuccess = (ticketData) => {
    return Swal.fire({
        icon: 'success',
        title: 'Tiket Berhasil Dibuat!',
        html: `
      <div class="text-left">
        <p class="mb-2"><strong>No. Tiket:</strong> ${ticketData.ticketNumber}</p>
        <p class="mb-2"><strong>Plat Nomor:</strong> ${ticketData.plateNumber}</p>
        <p class="mb-2"><strong>Jenis Kendaraan:</strong> ${ticketData.vehicleType}</p>
        <p><strong>Waktu Masuk:</strong> ${new Date(ticketData.entryTime).toLocaleString('id-ID')}</p>
      </div>
    `,
        confirmButtonColor: '#1e3a5f',
        confirmButtonText: 'OK'
    });
};

export const showPaymentSuccess = (paymentData) => {
    return Swal.fire({
        icon: 'success',
        title: 'Pembayaran Berhasil!',
        html: `
      <div class="text-left">
        <p class="mb-2"><strong>Total:</strong> ${paymentData.formattedAmount}</p>
        <p class="mb-2"><strong>Durasi:</strong> ${paymentData.formattedDuration}</p>
        <p><strong>Metode:</strong> ${paymentData.paymentMethod}</p>
      </div>
    `,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'OK'
    });
};

export default {
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showConfirm,
    showLoading,
    closeLoading,
    showTicketSuccess,
    showPaymentSuccess
};
